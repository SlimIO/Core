// Require Node.JS dependencies
require("v8-compile-cache");
const { join, isAbsolute } = require("path");
const { fork } = require("child_process");
const os = require("os");

// Require third-party dependencies
require("make-promises-safe");
const is = require("@sindresorhus/is");
const Config = require("@slimio/config");
const Addon = require("@slimio/addon");

// Require internal dependencie(s)
const { searchForAddons } = require("./utils");

// Fork wrapper path
const forkWrapper = join(__dirname, "fork.wrapper.js");

/**
 * @class Core
 * @property {Config} config Agent (core) configuration file
 * @property {Boolean} hasBeenInitialized Variable to know if the core has been initialize or not!
 * @property {Map<String, Addon>} addons Loaded addons
 * @property {Set<String>} rootingTable
 */
class Core {

    /**
     * @constructor
     */
    constructor() {
        this.config = null;
        this.hasBeenInitialized = false;
        this.addons = new Map();
        this.rootingTable = new Set();
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
        console.log(this.config.payload);
        if (Object.keys(addonsCfg).length === 0) {
            addonsCfg = await searchForAddons(Core.root);
            console.log(addonsCfg);
            this.config.set("addons", addonsCfg);
            await this.config.writeOnDisk();
        }

        // TODO: Get vCPU count ?

        /** @type {Addon[]} */
        const addons = Object.entries(addonsCfg)
            .filter(([, { standalone = false }]) => !standalone)
            .map(([addonName]) => join(Core.root, "addons", addonName, "index.js"))
            .map(require);

        // Verify each required index entry
        for (const addon of addons) {
            if (addon instanceof Addon === false) {
                continue;
            }
            setImmediate(async() => {
                try {
                    const { name } = await addon.executeCallback("get_info");
                    this.addons.set(name, addon);

                    // Setup start listener
                    addon.prependListener("start", () => {
                        console.log(`Addon ${name} started!`);
                        this.config.observableOf(`addons.${name}`).subscribe(
                            (curr) => {
                                this.updateAddon(name, curr).catch(console.error);
                            },
                            console.error
                        );
                        addon.prependListener("message", Core._messageHandler.bind(this));
                    });

                    // Setup stop listener
                    addon.prependListener("stop", () => {
                        console.log(`Addon ${name} stopped!`);
                        addon.removeListener("message");
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

        /** @type {Addon[]} */
        const parallelAddons = Object.entries(addonsCfg)
            .filter(([, { standalone = false }]) => standalone);

        // Init parallel addon
        for (const [addonName] of parallelAddons) {
            const fileIndex = join(Core.root, "addons", addonName, "index.js");
            const addonCP = fork(forkWrapper, [fileIndex]);
            addonCP.on("error", console.error);
            addonCP.on("data", ({ subject = "emitter", content }) => {
                switch (subject) {
                    case "emitter":
                        if (content === "init") {
                            this.addons.set(addonName, addonCP);
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

            // Setup timeout at the next iteration
            setImmediate(() => {

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
     * @private
     * @async
     * @public
     * @method updateAddon
     * @memberof Core#
     * @param {!String} addonName addonName
     * @param {!Object} newConfig new addon Configuration
     * @returns {Promise<void>} Return Async clojure
     */
    async updateAddon(addonName, newConfig) {
        const { active } = newConfig;
        const addon = this.addons.get(addonName);
        if (active && !addon.isStarted) {
            await this.execNativeCallback("start", addonName);
        }
        else if (!active && addon.isStarted) {
            await this.execNativeCallback("stop", addonName);
        }
    }

    /**
     * @public
     * @async
     * @method execNativeCallback
     * @desc execute a Native callback on all or given addon(s)
     * @memberof Core#
     * @param {!String} callbackName Callback name to execute
     * @param {String=} addonName Complete the argument to start only one addon!
     * @returns {Promise<Core>}
     *
     * @throws {TypeError}
     * @throws {Error}
     * @throws {RangeError}
     */
    async execNativeCallback(callbackName, addonName) {
        if (!is.string(callbackName)) {
            throw new TypeError(
                "Core.execNativeCallback->callbackName should be typeof <string>"
            );
        }
        if (!Addon.ReservedCallbacksName.has(callbackName)) {
            throw new Error(
                `Core.execNativeCallback->callbackName ${callbackName} is a not a native callback!`
            );
        }

        // If addonName argument is defined
        if (is.nullOrUndefined(addonName)) {

            /** @type {Addon[]} */
            const addons = [...this.addons.values()];
            await Promise.all(
                addons.map((addon) => addon.callbacks.get(callbackName)())
            );

            return this;
        }

        if (!is.string(addonName)) {
            throw new TypeError("Core.executeCallback->addonName should be typeof <string>");
        }
        if (!this.addons.has(addonName)) {
            throw new RangeError(
                `Core.executeCallback - Unknow addon with name <${addonName}>`
            );
        }
        await this.addons.get(addonName).callbacks.get(callbackName)();

        return this;
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
            throw new Error("Core.exit - Cannot exit an unitialized core");
        }
        await this.config.close();
        await this.execNativeCallback("stop");
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
