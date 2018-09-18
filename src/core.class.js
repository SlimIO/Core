// Require Node.JS dependencies
const { join, isAbsolute } = require("path");
const os = require("os");

// Require Third-party dependencies
require("make-promises-safe");
const is = require("@sindresorhus/is");

// Require Internal Dependencies
const Config = require("@slimio/config");
const Addon = require("@slimio/addon");
const { searchForAddons } = require("./utils");
const ParallelAddon = require("./parallelAddon.class");

// SCRIPT CONSTANTS
const AVAILABLE_CPU_LEN = os.cpus().length;
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

        // Setup class properties
        this.root = dirname;
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
     * @public
     * @memberof Core#
     * @member {String} root
     * @param {!String} value system path
     *
     * @throws {Error}
     */
    set root(value) {
        if (!isAbsolute(value)) {
            throw new Error("Core.root->value should be an absolute system path!");
        }

        Reflect.defineProperty(this, "_root", {
            value,
            writable: true
        });
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
                const responseBody = await this.routingTable.get(target)(args);

                const observer = addon.observers.get(messageId);
                observer.next(responseBody);
                observer.complete();
            };
        }

        // Setup start listener
        addon.prependListener("start", () => {
            for (const callback of callbacks) {
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

        const isStandalone = AVAILABLE_CPU_LEN > 1 ? standalone === true : false;
        if (!this._addons.has(addonName)) {
            if (!active) {
                return;
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
                    if (addon instanceof Addon === false) {
                        throw new Error(`Failed to load addon ${addonName} with entry file at ${addonEntryFile}`);
                    }
                    console.log(`Load (In same process as core) addon with name => ${addonName}`);
                }

                this._addons.set(addonName, addon);
                await this.loadAddon(addon);
            }
            catch (error) {
                // TODO: Review how to handle this error!
                console.error(error);
            }
        }
        else {
            addon = this._addons.get(addonName);
        }

        try {
            if (addon instanceof ParallelAddon && active && isStandalone) {
                addon.createForkProcesses();
            }
            setImmediate(() => {
                addon.executeCallback(active ? "start" : "stop");
            });
        }
        catch (error) {
            // TODO: Review how to handle this error!
            console.error(error);
        }
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

        // Close config (is not already closed!)
        if (this.config.configHasBeenRead) {
            await this.config.close();
        }
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
