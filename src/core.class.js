// Require Node.JS dependencies
const { join, isAbsolute } = require("path");
const { fork } = require("child_process");
const os = require("os");

// Require Third-party dependencies
require("make-promises-safe");
const is = require("@sindresorhus/is");

// Require Internal Dependencies
const Config = require("@slimio/config");
const Addon = require("@slimio/addon");
const { searchForAddons } = require("./utils");

// Fork wrapper path
const forkWrapper = join(__dirname, "fork.wrapper.js");

/**
 * @class Core
 * @property {Config} config Agent (core) configuration file
 * @property {Boolean} hasBeenInitialized Variable to know if the core has been initialize or not!
 * @property {Map<String, Addon>} _addons Loaded addons
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
        this.config = null;
        this.hasBeenInitialized = false;
        this._addons = new Map();
        this.rootingTable = new Set();

        // Handle exit signal!
        process.on("SIGINT", async() => {
            process.stdout.write("SIGINT detected... Exiting SlimIO Agent (please wait). \n");
            await this.exit().catch(console.error);
            process.exit(0);
        });
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
                this.addonOnConfigurationUpdate(name, curr).catch(console.error);
            },
            console.error
        );

        // Emit init
        addon.isConnected = true;

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
     * @throws {Error}
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
        if (Object.keys(addonsCfg).length === 0) {
            addonsCfg = await searchForAddons(Core.root);
            this.config.set("addons", addonsCfg);
            await this.config.writeOnDisk();
        }

        /** @type {Addon[]} */
        const addons = Object.entries(addonsCfg)
            .filter(([, { standalone = false }]) => !standalone)
            .map(([addonName]) => join(this.root, "addons", addonName, "index.js"))
            .map(require);

        // Verify each required index entry
        const addonToLoad = [];
        for (const addon of addons) {
            if (addon instanceof Addon === false) {
                continue;
            }
            addonToLoad.push(this._loadSynchronousAddon(addon));
        }
        // TODO: Sort addonToLoad by flag "builtin"
        Promise.all(addonToLoad).then((addons) => {
            for (const addon of addons) {
                addon.emit("init");
            }
        }).catch(console.error);

        /** @type {Addon[]} */
        const parallelAddons = Object.entries(addonsCfg)
            .filter(([, { standalone = false }]) => standalone);

        // Init parallel addon
        for (const [addonName] of parallelAddons) {
            const addonCP = fork(forkWrapper, [
                join(this.root, "addons", addonName, "index.js")
            ]);
            addonCP.on("error", (error) => {
                console.error(error);
            });
            addonCP.on("data", ({ subject = "emitter", content }) => {
                switch (subject) {
                    case "emitter":
                        if (content === "init") {
                            this._addons.set(addonName, addonCP);
                            this.rootingTable.add(addonName);
                        }
                        break;
                    case "message":
                        break;
                    default:
                        break;
                }
            });
            addonCP.on("close", (code) => {
                console.log(`Addon close with code: ${code}`);
            });
        }

        // Init core
        this.hasBeenInitialized = true;

        return this;
    }

    /**
     * @private
     * @async
     * @public
     * @method addonOnConfigurationUpdate
     * @desc This function is triggered when an Observed addon is updated!
     * @memberof Core#
     * @param {!String} addonName addonName
     * @param {!Object} newConfig new addon Configuration
     * @returns {Promise<void>} Return Async clojure
     */
    async addonOnConfigurationUpdate(addonName, { active }) {
        const addon = this._addons.get(addonName);
        const eventName = active && !addon.isStarted ? "start" : "stop";

        await addon.executeCallback(eventName);
    }

    /**
     * @public
     * @async
     * @method exit
     * @desc Exit the core properly
     * @memberof Core#
     * @returns {Promise<Core>}
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
