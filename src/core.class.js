// Require Node.JS dependencies
const { mkdir, writeFile } = require("fs").promises;
const { join, isAbsolute } = require("path");
const { Duplex } = require("stream");
const os = require("os");

// Require Third-party dependencies
require("make-promises-safe");
const is = require("@sindresorhus/is");

// Require Internal Dependencies
const Config = require("@slimio/config");
const { searchForAddons } = require("./utils");
const ParallelAddon = require("./parallelAddon.class");

// SCRIPT CONSTANTS
const AVAILABLE_CPU_LEN = os.cpus().length;
/* istanbul ignore if */
if (AVAILABLE_CPU_LEN === 1) {
    console.log("SlimIO Core - Only one vCPU available!");
}

/** @typedef {{ active: boolean; standalone?: boolean }} AddonProperties */
/** @typedef {{[key: string]: AddonProperties}} AddonCFG */

/**
 * @class Core
 * @property {Config} config Agent (core) configuration file
 * @property {Boolean} hasBeenInitialized Variable to know if the core has been initialize or not!
 * @property {Map<String, Addon>} _addons Loaded addons
 * @property {Addon[]} addons
 * @property {String} root
 */
class Core {

    /**
     * @constructor
     * @param {!String} dirname Core dirname
     * @param {Object} [options={}] options
     * @param {Number=} [options.autoReload=500] autoReload configuration
     *
     * @throws {TypeError}
     */
    constructor(dirname, options = Object.create(null)) {
        if (!is.string(dirname)) {
            throw new TypeError("dirname should be type <string>");
        }

        if (!is.object(options)) {
            throw new TypeError("options should be type <object>");
        }

        if (!isAbsolute(dirname)) {
            throw new Error("Core.root->value should be an absolute system path!");
        }

        Reflect.defineProperty(this, "_root", {
            value: dirname,
            writable: true
        });

        this.hasBeenInitialized = false;

        /** @type {Map<String, () => any>} */
        this.routingTable = new Map();

        /** @type {Map<String, Addon | ParallelAddon>} */
        this._addons = new Map();

        const configPath = join(this.root, "agent.json");
        this.config = new Config(configPath, {
            createOnNoEntry: true,
            writeOnSet: true,
            autoReload: true,
            defaultSchema: Core.DEFAULT_SCHEMA,
            reloadDelay: options.autoReload ? 500 : void 0
        });
    }

    /**
     * @public
     * @memberof Core#
     * @member {Addon[]} addons
     * @return {Addon[]}
     */
    get addons() {
        return [...this._addons.values()];
    }

    /**
     * @public
     * @memberof Core#
     * @member {String} root
     */
    get root() {
        return Reflect.get(this, "_root");
    }

    /**
     * @async
     * @private
     * @method loadAddon
     * @param {!Addon | ParallelAddon} addon addon
     * @returns {Promise<Addon>}
     *
     * @this Core
     */
    async loadAddon(addon) {
        /** @type {{name: string, callbacks: string[]}} */
        const { name, callbacks } = await addon.executeCallback("get_info");

        /** @type {() => void} */
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
                const responseBody = await this.routingTable.get(target)(args);
                addon.cp.send({ messageId, body: responseBody });
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
                const responseBody = await this.routingTable.get(target)(args);
                if (!addon.observers.has(messageId)) {
                    return;
                }

                const observer = addon.observers.get(messageId);
                observer.next(responseBody);
                observer.complete();
            };
        }

        // Setup ready listener
        addon.prependListener("ready", () => {
            for (const addon of this._addons.values()) {
                addon.emit("addonLoaded", name);
            }
        });

        // Setup start listener
        addon.prependListener("start", () => {
            for (const callback of callbacks) {
                console.log(`[CORE] Setup routing table: ${name}.${callback}`);
                this.routingTable.set(`${name}.${callback}`, (args) => {
                    return addon.executeCallback(callback, args);
                });
            }
            addon.prependListener("message", messageHandler);
        });

        // Setup stop listener
        addon.prependListener("stop", () => {
            addon.removeAllListeners("message");
            for (const callback of callbacks) {
                this.routingTable.delete(`${name}.${callback}`);
            }
        });

        return addon;
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
        try {
            await mkdir(join(this.root, "debug"));
        }
        catch (error) {
            if (error.code !== "EEXIST") {
                throw error;
            }
            console.log("[CORE] Root /debug directory already created!");
        }

        // Read the agent (core) configuration file
        await this.config.read(Core.DEFAULT_CONFIGURATION);

        /** @type {AddonCFG} */
        let addonsCfg = this.config.get("addons");

        // If the configuration is empty, search for addons on the disk
        if (Object.keys(addonsCfg).length === 0) {
            addonsCfg = await searchForAddons(this.root);
            this.config.set("addons", addonsCfg);
        }

        for (const [addonName] of Object.entries(addonsCfg)) {
            // Setup configuration observable at the next loop iteration!
            this.config.observableOf(`addons.${addonName}`).subscribe(
                (curr) => {
                    try {
                        this.onAddonReconfiguration(addonName, curr);
                    }
                    catch (error) {
                        console.error(error);
                    }
                },
                console.error
            );
        }

        // Setup initialization state to true
        this.hasBeenInitialized = true;

        return this;
    }

    /**
     * @public
     * @method generateDump
     * @desc Dump an error!
     * @memberof Core#
     * @param {any} error error that have to be dumped!
     * @returns {String}
     */
    generateDump(error) {
        const timestamp = Date.now();
        const dumpFile = join(this.root, "debug", `debug_${timestamp}.json`);
        const dumpStr = JSON.stringify({
            date: new Date(timestamp).toString(),
            code: error.code || null,
            message: error.message || "",
            stack: error.stack ? error.stack.split("\n") : ""
        }, null, 4);
        writeFile(dumpFile, dumpStr).catch(console.error);

        return dumpFile;
    }


    /**
     * @async
     * @private
     * @public
     * @method onAddonReconfiguration
     * @desc This function is triggered when an Observed addon is updated!
     * @memberof Core#
     * @param {!String} addonName addonName
     * @param {AddonProperties} newConfig new addon Configuration
     * @returns {void} Return Async clojure
     */
    async onAddonReconfiguration(addonName, { active, standalone }) {
        /** @type {Addon | ParallelAddon} */
        let addon = null;
        const isStandalone = AVAILABLE_CPU_LEN > 1 ? standalone : false;
        if (!this._addons.has(addonName)) {
            if (!active) {
                return void 0;
            }
            const addonEntryFile = join(this.root, "addons", addonName, "index.js");

            try {
                if (isStandalone) {
                    addon = new ParallelAddon(addonEntryFile, addonName);
                    addon.createForkProcesses();
                    console.log(`Load (Parallel) addon with name => ${addonName}`);
                }
                else {
                    addon = require(addonEntryFile);
                    if (addon.constructor.name !== "Addon") {
                        throw new Error(`Failed to load addon ${addonName} with entry file at ${addonEntryFile}`);
                    }
                    console.log(`Load (In same process as core) addon with name => ${addonName}`);
                }

                this._addons.set(addonName, addon);
                await this.loadAddon(addon);
            }
            catch (error) {
                const dumpFile = this.generateDump(error);
                console.log(`An error occured while loading addon ${addonName} (ERROR dumped in: ${dumpFile})`);

                return void 0;
            }
        }
        else {
            addon = this._addons.get(addonName);
        }

        const stateToBeTriggered = active ? "start" : "stop";
        try {
            if (addon instanceof ParallelAddon && active && isStandalone) {
                addon.createForkProcesses();
            }
            setImmediate(() => {
                addon.executeCallback(stateToBeTriggered);
            });
        }
        catch (error) {
            const dumpFile = this.generateDump(error);
            console.log(
                `An error occured while exec ${stateToBeTriggered} on addon ${addonName} (ERROR dumped in: ${dumpFile})`
            );
        }

        return void 0;
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
            this.addons.map((addon) => addon.executeCallback("stop"))
        );

        await this.config.close();

        this.hasBeenInitialized = false;
    }

}

// Default Core Configuration
Core.DEFAULT_CONFIGURATION = {
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    addons: {}
};

// Default Core Configuration JSON Schema
Core.DEFAULT_SCHEMA = require("./config/agent.schema.json");

// Export Core class
module.exports = Core;
