// Require Node.JS dependencies
const { join } = require("path");
const os = require("os");

// Require Third-party dependencies
require("make-promises-safe");
const Config = require("@slimio/config");
const { createDirectory } = require("@slimio/utils");
const is = require("@slimio/is");

// Require Internal Dependencies
const { searchForAddons, generateDump } = require("./utils");
const ParallelAddon = require("./parallelAddon.class");

// SCRIPT CONSTANTS
const AVAILABLE_CPU_LEN = os.cpus().length;

/** @typedef {{ active: boolean, standalone: boolean? }} AddonProperties */
/** @typedef {Object.<string, AddonProperties>} AddonCFG */

/**
 * @class Core
 * @property {Config} config Agent (core) configuration file
 * @property {Boolean} hasBeenInitialized Variable to know if the core has been initialize or not!
 * @property {Map<String, Addon.Callback>} routingTable routingTable
 * @property {Map<String, Addon>} addons Loaded addons
 * @property {String} root
 */
class Core {

    /**
     * @constructor
     * @param {!String} dirname Core dirname
     * @param {Object} [options={}] options
     * @param {Number=} [options.autoReload=500] autoReload configuration
     * @param {Boolean=} [options.silent] configure core to be silent
     *
     * @throws {TypeError}
     * @throws {Error}
     */
    constructor(dirname, options = Object.create(null)) {
        if (!is.string(dirname)) {
            throw new TypeError("dirname should be typeof string!");
        }

        if (!is.plainObject(options)) {
            throw new TypeError("options should be a plain object!");
        }

        /** @type {Map<String, Addon.Callback>} */
        this.routingTable = new Map();

        /** @type {Map<String, Addon | ParallelAddon>} */
        this.addons = new Map();

        this.root = dirname;
        this.silent = options.silent || false;
        this.hasBeenInitialized = false;

        const autoReload = typeof options.autoReload === "boolean" ? options.autoReload : false;
        this.config = new Config(join(this.root, "agent.json"), {
            createOnNoEntry: true,
            writeOnSet: true,
            autoReload,
            defaultSchema: Core.DEFAULT_SCHEMA,
            reloadDelay: autoReload ? 500 : void 0
        });
    }

    /**
     * @public
     * @async
     * @method stdout
     * @desc stdout message
     * @param {String=} [msg=""] message to put stdout
     * @memberof Core#
     * @returns {void}
     */
    stdout(msg = "") {
        if (this.silent) {
            return;
        }
        process.stdout.write(`[CORE] ${msg}\n`);
    }

    /**
     * @public
     * @async
     * @method initialize
     * @desc Initialize the core (load configuration, establish a list of addons to pre-load before start phase)
     * @memberof Core#
     * @returns {Promise<this>}
     *
     * @throws {TypeError}
     */
    async initialize() {
        // Create root debug directory
        createDirectory(join(this.root, "debug"));

        // Read the agent (core) configuration file
        await this.config.read(Core.DEFAULT_CONFIGURATION);

        /** @type {AddonCFG} */
        let addonsCfg = this.config.get("addons");

        // If the configuration is empty, search for addons on the disk
        if (Object.keys(addonsCfg).length === 0) {
            addonsCfg = await searchForAddons(this.root);
            this.config.set("addons", addonsCfg);
        }

        // Setup configuration observable
        for (const [addonName] of Object.entries(addonsCfg)) {
            this.config.observableOf(`addons.${addonName}`).subscribe(
                (curr) => {
                    this.setupAddonConfiguration(addonName, curr)
                        .catch((error) => generateDump(this.root, error));
                },
                (error) => generateDump(this.root, error)
            );
        }

        // Setup initialization state to true
        this.hasBeenInitialized = true;

        return this;
    }

    /**
     * @async
     * @private
     * @public
     * @method setupAddonConfiguration
     * @desc This function is triggered when an Observed addon is updated!
     * @memberof Core#
     * @param {!String} addonName addonName
     * @param {AddonProperties} newConfig new addon Configuration
     * @returns {void} Return Async clojure
     */
    async setupAddonConfiguration(addonName, { active, standalone }) {
        /** @type {Addon | ParallelAddon} */
        let addon = null;
        const isStandalone = AVAILABLE_CPU_LEN > 1 ? standalone : false;

        if (!this.addons.has(addonName)) {
            if (!active) {
                return void 0;
            }
            const addonEntryFile = join(this.root, "addons", addonName, "index.js");

            try {
                if (isStandalone) {
                    addon = new ParallelAddon(addonEntryFile, addonName);
                    addon.createForkProcesses();
                    this.stdout(`Load (Parallel) addon with name => ${addonName}`);
                }
                else {
                    // addon = await import(addonEntryFile);
                    // console.log(addon);
                    addon = require(addonEntryFile);
                    if (addon.constructor.name !== "Addon") {
                        throw new Error(`Failed to load addon ${addonName} with entry file at ${addonEntryFile}`);
                    }
                    addon.catch((error, eventName) => {
                        const dumpFile = generateDump(this.root, error);
                        this.stdout(
                            `En Error occured in ${addonName}, event ${eventName} (ERROR dumped in: ${dumpFile})`
                        );
                    });
                    this.stdout(`Load (In same process as core) addon with name => ${addonName}`);
                }

                this.addons.set(addonName, addon);
                await this.setupAddonListener(addon);
            }
            catch (error) {
                const dumpFile = generateDump(this.root, error);
                this.stdout(`An error occured while loading addon ${addonName} (ERROR dumped in: ${dumpFile})`);

                return void 0;
            }
        }
        else {
            addon = this.addons.get(addonName);
        }

        const stateToBeTriggered = active ? "start" : "stop";
        try {
            if (addon instanceof ParallelAddon && active && isStandalone) {
                addon.createForkProcesses();
            }
            setImmediate(() => {
                addon.executeCallback(stateToBeTriggered);
            });
            if (!active) {
                this.addons.delete(addonName);
            }
        }
        catch (error) {
            const dumpFile = generateDump(this.root, error);
            this.stdout(
                `An error occured while exec ${stateToBeTriggered} on addon ${addonName} (ERROR dumped in: ${dumpFile})`
            );
        }

        return void 0;
    }

    /**
     * @async
     * @private
     * @method setupAddonListener
     * @desc Setup all listeners for a given Addon!
     * @param {!Addon | ParallelAddon} addon addon
     * @returns {Promise<Addon>}
     *
     * @this Core
     */
    async setupAddonListener(addon) {
        /** @type {{name: string, callbacks: string[]}} */
        const { name, callbacks } = await addon.executeCallback("get_info");

        let messageHandler = null;
        if (addon instanceof ParallelAddon) {
            /**
             * @async
             * @func messageHandler
             * @desc Handle addon message!
             * @param {!String} messageId messageId
             * @param {!String} target target
             * @param {any[]} args Callback arguments
             * @returns {void}
             */
            messageHandler = async(messageId, target, args) => {
                if (!this.routingTable.has(target)) {
                    return;
                }

                const header = { from: target, id: messageId };
                try {
                    const body = await this.routingTable.get(target)(messageId, name, args);
                    if (!is.nullOrUndefined(body.error)) {
                        throw new Error(body.error);
                    }

                    if (body.constructor.name === "Stream") {
                        for await (const buf of body) {
                            addon.cp.send({
                                target: 2, header, data: { body: buf.toString(), completed: false }
                            });
                        }
                        addon.cp.send({ target: 2, header, data: { completed: true } });
                    }
                    else {
                        addon.cp.send({ target: 2, header, data: { body } });
                    }
                }
                catch (error) {
                    addon.cp.send({ target: 2, header, data: { error: error.message } });
                }
            };
        }
        else {
            /**
             * @async
             * @func messageHandler
             * @desc Handle addon message!
             * @param {!String} messageId messageId
             * @param {!String} target target
             * @param {any[]} args Callback arguments
             * @returns {void}
             */
            messageHandler = async(messageId, target, args) => {
                if (!this.routingTable.has(target)) {
                    return;
                }

                try {
                    const responseBody = await this.routingTable.get(target)(messageId, name, args);
                    if (!addon.observers.has(messageId)) {
                        return;
                    }

                    const isObj = is.object(responseBody);
                    if (isObj && !is.nullOrUndefined(responseBody.error)) {
                        throw new Error(responseBody.error);
                    }

                    const observer = addon.observers.get(messageId);
                    if (isObj && responseBody.constructor.name === "Stream") {
                        for await (const buf of responseBody) {
                            observer.next(buf.toString());
                        }
                    }
                    else {
                        observer.next(responseBody);
                    }
                    observer.complete();
                }
                catch (error) {
                    if (!addon.observers.has(messageId)) {
                        return;
                    }

                    const observer = addon.observers.get(messageId);
                    observer.error(error);
                }
            };
        }

        // Setup ready listener
        addon.prependListener("ready", () => {
            for (const [addonName, addon] of this.addons.entries()) {
                if (addonName === name) {
                    continue;
                }
                addon.emit("addonLoaded", name);
            }
        });

        // Setup start listener
        addon.prependListener("start", () => {
            for (const callback of callbacks) {
                this.stdout(`Setup routing table: ${name}.${callback}`);
                this.routingTable.set(`${name}.${callback}`, (id, from, args) => {
                    return addon.executeCallback(callback, { id, from }, ...args);
                });
            }
            addon.prependListener("message", messageHandler);
        });

        // Setup stop listener
        addon.prependListener("stop", () => {
            addon.removeEventListener("message", messageHandler);
            for (const callback of callbacks) {
                this.routingTable.delete(`${name}.${callback}`);
            }
        });

        return addon;
    }

    /**
     * @public
     * @async
     * @method exit
     * @desc Exit the core properly
     * @memberof Core#
     * @returns {Promise<void>}
     *
     * @throws {Error}
     */
    async exit() {
        if (!this.hasBeenInitialized) {
            throw new Error("Core.exit - Cannot close unitialized core");
        }

        // Wait for all addons to be stopped!
        await Promise.all(
            [...this.addons.values()].map((addon) => addon.executeCallback("stop"))
        );

        await this.config.close();

        this.hasBeenInitialized = false;
    }

}

// Default Core Configuration
Core.DEFAULT_CONFIGURATION = {
    addons: {}
};

// Default Core Configuration JSON Schema
Core.DEFAULT_SCHEMA = require("./config/agent.schema.json");

// Export Core class
module.exports = Core;
