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

        /** @type {Map<String, Addon | ParallelAddon>} */
        this._addons = new Map();

        const configPath = join(this.root, "agent.json");
        this.config = new Config(configPath, {
            createOnNoEntry: true,
            writeOnSet: true,
            autoReload: true,
            defaultSchema: Core.DEFAULTSchema,
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
        console.time("get_info");
        /** @type {{name: string}} */
        const { name } = await addon.executeCallback("get_info");
        console.timeEnd("get_info");

        console.log(`Initializing addon with name ${name}`);
        this._addons.set(name, addon);

        // Know if the addon is parallel or not!
        const isParallelAddon = addon instanceof ParallelAddon;

        /**
         * @async
         * @func _messageHandler
         * @desc Handle addon message!
         * @param {!String} messageId messageId
         * @param {!String} target target
         * @param {any[]} args Callback arguments
         * @returns {void}
         */
        const messageHandler = async(messageId, target, args) => {
            const [addonName, targettedCallback] = target.split(".");
            const targetAddon = this._addons.get(addonName);

            const responseBody = await targetAddon.executeCallback(targettedCallback, args);
            if (!isParallelAddon) {
                const observer = addon.observers.get(messageId);
                observer.next(responseBody);
                observer.complete();
            }
            else {
                addon.cp.send({ messageId, body: responseBody });
            }
        };

        // Setup start listener
        addon.prependListener("start", () => {
            console.log(`Addon ${name} started!`);
            addon.prependListener("message", messageHandler);
        });

        // Setup stop listener
        addon.prependListener("stop", () => {
            console.log(`Addon ${name} stopped!`);
            addon.removeAllListeners("message");
        });

        // Setup configuration observable!
        this.config.observableOf(`addons.${name}`).subscribe(
            (curr) => {
                this.onAddonReconfiguration(name, curr);
            },
            console.error
        );

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
        await this.config.read(Core.DEFAULTConfiguration);

        /** @type {AddonCFG} */
        let addonsCfg = this.config.get("addons");

        // If the configuration is empty, search for addons on the disk
        if (Object.keys(addonsCfg).length === 0) {
            addonsCfg = await searchForAddons(this.root);
            this.config.set("addons", addonsCfg);
        }

        /** @type {Addon[]} */
        const synchronousAddonToLoad = [];
        for (const [addonName, { standalone }] of Object.entries(addonsCfg)) {
            const addonEntryFile = join(this.root, "addons", addonName, "index.js");
            if (standalone) {
                const addon = new ParallelAddon(addonEntryFile, addonName);

                // Add and observer configuration at the next loop iteration
                setImmediate(() => {
                    this.loadAddon(addon).catch(console.error);
                });
                continue;
            }

            try {
                /** @type {Addon} */
                const addon = require(addonEntryFile);
                if (addon instanceof Addon === false) {
                    throw new Error(`Failed to load addon ${addonName} with entry file at ${addonEntryFile}`);
                }
                synchronousAddonToLoad.push(this.loadAddon(addon));
            }
            catch (error) {
                console.error(error);
            }
        }

        // Wait for all Synchronous Addon to be fully loaded to send an "init" event!
        for (const addon of await Promise.all(synchronousAddonToLoad)) {
            addon.emit("init");
        }

        // Setup initialization state to true
        this.hasBeenInitialized = true;

        return this;
    }

    /**
     * @private
     * @public
     * @method onAddonReconfiguration
     * @desc This function is triggered when an Observed addon is updated!
     * @memberof Core#
     * @param {!String} addonName addonName
     * @param {AddonProperties} newConfig new addon Configuration
     * @returns {void} Return Async clojure
     */
    onAddonReconfiguration(addonName, { active }) {
        const addon = this._addons.get(addonName);
        if (!addon.isStarted && !active) {
            return;
        }

        try {
            addon.executeCallback(active ? "start" : "stop");
        }
        catch (error) {
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

        await this.config.close();
        await Promise.all(
            this.addons.map((addon) => addon.executeCallback("stop"))
        );
        this.hasBeenInitialized = false;
    }

}

// Default Core Configuration
Core.DEFAULTConfiguration = {
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    addons: {}
};

// Default Core Configuration JSON Schema
Core.DEFAULTSchema = require("./config/agent.schema.json");

// Export Core class
module.exports = Core;
