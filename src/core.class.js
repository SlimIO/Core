// Require Node.JS dependencies
const { join, isAbsolute } = require("path");
const os = require("os");

// Require third-party dependencies
require("make-promises-safe");
const is = require("@sindresorhus/is");
const Config = require("@slimio/config");

// Require internal dependencie(s)
const { searchForValidAddonsOnDisk } = require("./utils");

// Privates Symbol
const Root = Symbol();

/**
 * @class Core
 * @property {Config} config Agent (core) configuration file
 * @property {Boolean} hasBeenInitialized Variable to know if the core has been initialize or not!
 * @property {Map<String, any>} addons Loaded addons
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
        return this[Root];
    }

    /**
     * @public
     * @memberof Core#
     * @member {String} root
     * @param {!String} sysPath system path
     *
     * @throws {Error}
     */
    static set root(sysPath) {
        if (!isAbsolute(sysPath)) {
            throw new Error("Core.root->sysPath should be an absolute system path!");
        }
        this[Root] = sysPath;
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
        // TODO: add options to not search on disk
        let addons = this.config.get("addons");
        if (Reflect.ownKeys(addons).length === 0) {
            addons = await searchForValidAddonsOnDisk(Core.root);
            this.config.set("addons", addons);
            await this.config.writeOnDisk();
        }
        for (const [addonName, addonProperties] of Object.entries(addons)) {
            this.config.observableOf(`addons.${addonName}`).subscribe(console.log);
        }

        // Init core
        this.hasBeenInitialized = true;
        process.on("SIGINT", async() => {
            process.stdout.write("SIGINT detected... Exiting SlimIO Agent (please wait). \n");
            await this.exit();
            process.exit(0);
        });

        return this;
    }

    /**
     * @public
     * @async
     * @method start
     * @desc Start one/many addons (if they are not yet started!)
     * @memberof Core#
     * @param {String=} addonName Complete the argument to start only one addon!
     * @param {Boolean=} [shadowRun=false]
     * @returns {Promise<Core>}
     *
     * @throws {TypeError}
     * @throws {RangeError}
     */
    async start(addonName, shadowRun = false) {
        if (!is.nullOrUndefined(addonName)) {
            if (!is.string(addonName)) {
                throw new TypeError("Core.start->addonName should be typeof <string>");
            }
            if (!this.addons.has(addonName)) {
                throw new RangeError(`Core.start - Unknow addon with name <${addonName}>`);
            }
        }
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
