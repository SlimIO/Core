// Require Node.JS dependencies
const { join, isAbsolute } = require("path");
const os = require("os");

// Require third-party dependencies
const is = require("@sindresorhus/is");
const Config = require("@slimio/config");

// Privates Symbol
const Root = Symbol();

/**
 * @class Core
 * @property {Config} config Agent (core) configuration file
 * @property {Boolean} hasBeenInitialized Variable to know if the core has been initialize or not!
 */
class Core {

    /**
     * @constructor
     */
    constructor() {
        this.config = null;
        this.hasBeenInitialized = false;
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
     * @desc Initialize core
     * @memberof Core#
     * @param {!Boolean} [autoReload=true] enable/disable autoReload of the core configuration
     * @returns {Promise<Core>}
     *
     * @throws {Error}
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
                autoReload
            };
            if (autoReload) {
                Reflect.set(configOptions, "reloadDelay", 500);
            }
            this.config = new Config(configPath, configOptions);
        }
        await this.config.read(Core.DEFAULTConfiguration);

        // Retrieve addon(s) list!
        const addons = this.config.get("addons");
        console.log(addons);

        // Length keys of 0 ? -> Check for addons on disk
        // Else load from addons

        // Init core
        this.hasBeenInitialized = true;

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

module.exports = Core;
