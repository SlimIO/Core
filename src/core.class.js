// Require Node.JS dependencies
const { join, isAbsolute } = require("path");
const os = require("os");

// Require third-party dependencies
require("make-promises-safe");
const is = require("@sindresorhus/is");
const Config = require("@slimio/config");
const Addon = require("@slimio/addon");

// Require internal dependencie(s)
const { searchForAddons } = require("./utils");

/**
 * @class Core
 * @property {Config} config Agent (core) configuration file
 * @property {Boolean} hasBeenInitialized Variable to know if the core has been initialize or not!
 * @property {Map<String, Addon>} addons Loaded addons
 */
class Core {

    /**
     * @constructor
     */
    constructor() {
        this.config = null;
        this.hasBeenInitialized = false;
        this.addons = new Map();
    }

    /**
     * @public
     * @memberof Core#
     * @member {String} root
     */
    static get root() {
        return Reflect.get(Core, "_core");
    }

    /**
     * @public
     * @memberof Core#
     * @member {String} root
     * @param {!String} value system path
     *
     * @throws {Error}
     */
    static set root(value) {
        if (!isAbsolute(value)) {
            throw new Error("Core.root->value should be an absolute system path!");
        }
        Reflect.defineProperty(Core, "_core", {
            value,
            writable: true
        });
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
     * @throws {Error}
     * @throws {TypeError}
     */
    async initialize(autoReload = true) {
        if (is.nullOrUndefined(Core.root)) {
            throw new Error("Core.initialize - Core.root should be defined before initialization!");
        }
        if (!is.boolean(autoReload)) {
            throw new TypeError("Core.initialize->autoReload should be typeof <Boolean>");
        }

        // Read the agent (core) configuration file
        {
            const configPath = join(Core.root, "agent.json");
            const configOptions = {
                createOnNoEntry: true,
                autoReload,
                defaultSchema: Core.DEFAULTSchema
            };
            if (autoReload) {
                Reflect.set(configOptions, "reloadDelay", 500);
            }
            this.config = new Config(configPath, configOptions);
        }
        await this.config.read(Core.DEFAULTConfiguration);

        // Retrieve addon(s) list!
        let addonsCfg = this.config.get("addons");
        if (Object.keys(addonsCfg).length === 0) {
            addonsCfg = await searchForAddons(Core.root);
            this.config.set("addons", addonsCfg);
            await this.config.writeOnDisk();
        }

        /**
         * Require addons
         * @type {Addon[]}
         */
        const addons = Object.keys(addonsCfg)
            .map((path) => join(Core.root, "addons", path, "index.js"))
            .map(require);

        // Verify each required index entry
        for (const addon of addons) {
            if (addon instanceof Addon === false) {
                continue;
            }
            process.nextTick(async() => {
                try {
                    const { name } = await addon.executeCallback("get_info");
                    this.addons.set(name, addon);
                    this.config.observableOf(`addons.${name}`)
                        .subscribe(Core._updateAddonConfiguration(name));

                    // Setup start listener
                    addon.on("start", () => {
                        console.log(`Addon ${name} started!`);
                    });

                    // Setup start listener
                    addon.on("stop", () => {
                        console.log(`Addon ${name} stopped!`);
                    });

                    // Emit init
                    addon.isConnected = true;
                    addon.emit("init");
                }
                catch (err) {
                    process.stderr.write(err);
                }
            });
        }

        // Init core
        this.hasBeenInitialized = true;
        process.on("SIGINT", async() => {
            process.stdout.write("SIGINT detected... Exiting SlimIO Agent (please wait). \n");
            await this.exit().catch(console.error);
            process.exit(0);
        });

        return this;
    }

    /**
     * @static
     * @public
     * @method _updateAddonConfiguration
     * @memberof Core#
     * @param {!String} addonName addonName
     * @returns {Function<void>} Return clojure
     */
    static _updateAddonConfiguration(addonName) {
        return (newConfig) => {
            console.log(`addon ${addonName} new config ${JSON.stringify(newConfig, null, 4)}`);
        };
    }

    /**
     * @public
     * @async
     * @method executeCallback
     * @desc execute a callback on all or given addon
     * @memberof Core#
     * @param {!String} callbackName Callback name to execute
     * @param {String=} addonName Complete the argument to start only one addon!
     * @returns {Promise<Core>}
     *
     * @throws {TypeError}
     * @throws {RangeError}
     */
    async executeCallback(callbackName, addonName) {
        if (!is.string(callbackName)) {
            throw new TypeError("Core.executeCallback->callbackName should be typeof <string>");
        }

        /**
         * Start all addons!
         * @type {Addon[]}
         */
        const addons = [];

        // If addonName argument is defined
        if (!is.nullOrUndefined(addonName)) {
            if (!is.string(addonName)) {
                throw new TypeError("Core.executeCallback->addonName should be typeof <string>");
            }
            if (!this.addons.has(addonName)) {
                throw new RangeError(
                    `Core.executeCallback - Unknow addon with name <${addonName}>`
                );
            }
            addons.push(this.addons.get(addonName));
        }
        else {
            addons.push(...this.addons.values());
        }

        // Execute callback on addon(s)
        await Promise.all(
            addons.map((addon) => addon.callbacks.get(callbackName)())
        );

        return this;
    }

    /**
     * @public
     * @async
     * @method exit
     * @desc Exit core
     * @memberof Core#
     * @returns {Promise<Core>}
     *
     * @throws {Error}
     */
    async exit() {
        if (!this.hasBeenInitialized) {
            throw new Error("Core.exit - Cannot exit an unitialized core");
        }
        await this.config.close();
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
