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

/**
 * @class Core
 * @property {Config} config Agent (core) configuration file
 * @property {Boolean} hasBeenInitialized Variable to know if the core has been initialize or not!
 * @property {Map<String, Addon>} _addons Loaded addons
 * @property {Addon[]} addons
 * @property {String} root
 * @property {Set<String>} rootingTable
 */
class Core {

    /**
     * @constructor
     * @param {!String} dirname Core dirname
     *
     * @throws {TypeError}
     */
    constructor(dirname) {
        if (!is.string(dirname)) {
            throw new TypeError("dirname should be type <string>");
        }

        // Setup class properties
        this.root = dirname;
        this.hasBeenInitialized = false;
        this._addons = new Map();
        this.rootingTable = new Set();
        this.config = null;
    }

    /**
     * @public
     * @memberof Core#
     * @member {Addon[]} addons
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
        return Reflect.get(this, "_core");
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

        Reflect.defineProperty(this, "_core", {
            value,
            writable: true
        });
    }

    /**
     * @static
     * @method _messageHandler
     * @desc Handle addon message!
     * @memberof Core#
     * @param {!String} messageId messageId
     * @param {!String} target target
     * @param {any[]} args Callback arguments
     * @returns {Promise<void>}
     */
    static _messageHandler(messageId, target, args) {
        console.log(messageId);
        console.log(target);
        console.log(args);
    }

    /**
     * @async
     * @private
     * @method _loadSynchronousAddon
     * @param {!Addon} addon addon
     * @returns {Promise<Addon>}
     *
     * @this Core
     */
    async _loadSynchronousAddon(addon) {
        const { name } = await addon.executeCallback("get_info");
        console.log(`Initializing addon with name ${name}`);
        this._addons.set(name, addon);

        // Setup start listener
        addon.prependListener("start", () => {
            console.log(`Addon ${name} started!`);
            addon.prependListener("message", Core._messageHandler.bind(this));
        });

        // Setup stop listener
        addon.prependListener("stop", () => {
            console.log(`Addon ${name} stopped!`);
            addon.removeAllListeners("message");
        });

        // Setup configuration observable!
        this.config.observableOf(`addons.${name}`).subscribe(
            (curr) => {
                this.addonConfigurationObserver(name, curr).catch(console.error);
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
     * @param {!Boolean} [autoReload=true] enable/disable autoReload of the core configuration
     * @returns {Promise<Core>}
     *
     * @throws {TypeError}
     */
    async initialize(autoReload = true) {
        if (!is.boolean(autoReload)) {
            throw new TypeError("Core.initialize->autoReload should be typeof <Boolean>");
        }

        // Read the agent (core) configuration file
        this.config = new Config(join(this.root, "agent.json"), {
            createOnNoEntry: true,
            autoReload,
            defaultSchema: Core.DEFAULTSchema,
            reloadDelay: autoReload ? 500 : void 0
        });
        await this.config.read(Core.DEFAULTConfiguration);

        // Retrieve addon(s) list!
        let addonsCfg = this.config.get("addons");

        // If the configuration is empty, search for addons on the disk
        if (Object.keys(addonsCfg).length === 0) {
            addonsCfg = await searchForAddons(this.root);
            this.config.set("addons", addonsCfg);
            await this.config.writeOnDisk();
        }

        // Initialize all addons!
        const synchronousAddonToLoad = [];
        for (const [addonName, { standalone }] of Object.entries(addonsCfg)) {
            const addonEntryFile = join(this.root, "addons", addonName, "index.js");
            if (standalone) {
                const addon = new ParallelAddon(addonEntryFile, addonName);

                // Add and observer configuration at the next loop iteration
                setImmediate(() => {
                    this._addons.set(addonName, addon);
                    this.config.observableOf(`addons.${addonName}`).subscribe(
                        (curr) => {
                            this.addonConfigurationObserver(addonName, curr).catch(console.error);
                        },
                        console.error
                    );
                });
                continue;
            }

            try {
                const addon = require(addonEntryFile);
                if (addon instanceof Addon === false) {
                    throw new Error(`Failed to load addon ${addonName} with entry file at ${addonEntryFile}`);
                }
                synchronousAddonToLoad.push(this._loadSynchronousAddon(addon));
            }
            catch (error) {
                console.error(error);
            }
        }

        // Wait for all Synchronous Addon to be fully loaded to send an "init" event!
        (await Promise.all(synchronousAddonToLoad)).forEach((addon) => {
            addon.emit("init");
        });

        // Setup initialization state to true
        this.hasBeenInitialized = true;

        return this;
    }

    /**
     * @private
     * @async
     * @public
     * @method addonConfigurationObserver
     * @desc This function is triggered when an Observed addon is updated!
     * @memberof Core#
     * @param {!String} addonName addonName
     * @param {!Object} newConfig new addon Configuration
     * @returns {Promise<void>} Return Async clojure
     */
    async addonConfigurationObserver(addonName, { active }) {
        const addon = this._addons.get(addonName);
        if (!addon.isStarted && !active) {
            return;
        }

        await addon.executeCallback(active ? "start" : "stop");
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
