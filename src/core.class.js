// Require Node.JS dependencies
import { join } from "path";
import { createRequire } from 'module';
import { fileURLToPath as fromURL, pathToFileURL } from 'url';
import os from "os";

// Require Third-party dependencies
import Config from "@slimio/config";
import utils from "@slimio/utils";
import is from "@slimio/is";
import IPC from "@slimio/ipc";
import Logger from "@slimio/logger";
import isStream from "is-stream";
import semver from "semver";

// Require Internal Dependencies
import { searchForAddons, generateDump } from "./utils.js";
import ParallelAddon from "./parallelAddon.class.js";

// CONSTANTS
const AVAILABLE_CPU_LEN = os.cpus().length;
const SYM_ADDON = Symbol.for("Addon");

// Vars
const __filename = fromURL(import.meta.url);
const require = createRequire(__filename);

/** @typedef {{ active: boolean, standalone: boolean? }} AddonProperties */
/** @typedef {object.<string, AddonProperties>} AddonCFG */

export default class Core {
    /**
     * @class Core
     * @param {!string} dirname Core dirname
     * @param {object} [options={}] options
     * @param {number} [options.autoReload=500] autoReload configuration
     * @param {boolean} [options.silent] configure core to be silent
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

        /** @type {Map<string, Addon.Callback>} */
        this.routingTable = new Map();

        /** @type {Map<string, Addon>} */
        this.addons = new Map();

        this.root = dirname;
        this.silent = options.silent || false;
        this.hasBeenInitialized = false;
        this.logger = new Logger(void 0, { title: "core" });

        const autoReload = typeof options.autoReload === "boolean" ? options.autoReload : false;
        this.config = new Config(join(this.root, "agent.json"), {
            createOnNoEntry: true,
            writeOnSet: true,
            autoReload,
            defaultSchema: Core.DEFAULT_SCHEMA,
            reloadDelay: autoReload ? 500 : void 0
        });

        global.slimio_core = this;
    }

    /**
     * @public
     * @async
     * @function stdout
     * @description stdout message
     * @param {string} msg message to put stdout
     * @memberof Core#
     * @returns {void}
     */
    stdout(msg) {
        if (!this.silent) {
            this.logger.writeLine(msg);
        }
    }

    /**
     * @public
     * @async
     * @function initialize
     * @description Initialize the core (load configuration, establish a list of addons to pre-load before start phase)
     * @memberof Core#
     * @returns {Promise<this>}
     *
     * @throws {TypeError}
     */
    async initialize() {
        // Create root debug directory
        utils.createDirectory(join(this.root, "debug"));

        // Read the agent (core) configuration file
        await this.config.read(Core.DEFAULT_CONFIGURATION);

        /** @type {AddonCFG} */
        let addonsCfg = this.config.get("addons");

        // If the configuration is empty, search for addons on the disk
        if (Object.keys(addonsCfg).length === 0) {
            this.stdout("Searching for addons locally");
            addonsCfg = await searchForAddons(this.root);
            this.config.set("addons", addonsCfg);
        }

        // Setup configuration observable
        this.config.observableOf("addons").subscribe(
            (curr) => {
                for (const [addonName, config] of Object.entries(curr)) {
                    this.setupAddonConfiguration(addonName, config)
                        .catch((err) => generateDump(this.root, err));
                }
            },
            (error) => generateDump(this.root, error)
        );

        // Setup initialization state to true
        this.hasBeenInitialized = true;

        return this;
    }

    /**
     * @public
     * @generator
     * @function searchForLockedAddons
     * @param {!string} addonName
     */
    * searchForLockedAddons(addonName) {
        for (const addon of this.addons.values()) {
            if (addon.locks.has(addonName)) {
                yield addon.name;
            }
        }
    }

    /**
     * @async
     * @private
     * @public
     * @function setupAddonConfiguration
     * @description This function is triggered when an Observed addon is updated!
     * @memberof Core#
     * @param {!string} addonName addonName
     * @param {AddonProperties} newConfig new addon Configuration
     * @returns {Promise<void>} Return Async clojure
     */
    async setupAddonConfiguration(addonName, { active, standalone }) {
        /** @type {Addon} */
        let addon = null;
        const isStandalone = AVAILABLE_CPU_LEN > 1 ? standalone : false;

        if (this.addons.has(addonName)) {
            addon = this.addons.get(addonName);
        }
        else {
            if (!active) {
                return void 0;
            }
            const addonEntryFile = pathToFileURL(join(this.root, "addons", addonName, "index.js"));

            try {
                if (isStandalone) {
                    addon = new ParallelAddon(addonEntryFile, addonName);
                    addon.createForkProcesses();
                    this.stdout(`Load addon '${addonName}' on his own Node.js process!`);
                }
                else {
                    addon = (await import(addonEntryFile)).default;
                    if (Boolean(addon[SYM_ADDON]) === false) {
                        throw new Error(`Addon '${addonName}' (${addonEntryFile}) not detected as an Addon.`);
                    }

                    const requiredVersion = addon.constructor.REQUIRED_CORE_VERSION || "*";
                    if (!semver.satisfies(global.coreVersion, requiredVersion)) {
                        // eslint-disable-next-line
                        throw new Error(`Addon '${addonName}' (${addonEntryFile}) container version doens't satifies the core version '${global.coreVersion}' with range of '${requiredVersion}'`);
                    }

                    addon.catch((error, eventName) => {
                        if (eventName === "start") {
                            addon.executeCallback("stop");
                        }
                        const dumpFile = generateDump(this.root, error);
                        this.stdout(
                            `An error occured in addon '${addonName}' (event '${eventName}') - ERR dumped at: ${dumpFile}`
                        );
                    });
                    this.stdout(`Load addon '${addonName}' on the current Node.js process!`);
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

        const stateToBeTriggered = active ? "start" : "stop";
        try {
            if (addon instanceof ParallelAddon && active && isStandalone) {
                addon.createForkProcesses();
            }

            if (stateToBeTriggered === "stop") {
                for (const name of this.searchForLockedAddons(addonName)) {
                    this.addons.get(name).executeCallback("sleep");
                }
            }
            setImmediate(() => addon.executeCallback(stateToBeTriggered));

            // TODO: do we cleanup inactive addons ?
            // if (!active) {
            //     this.addons.delete(addonName);
            // }
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
     * @function setupAddonListener
     * @description Setup all listeners for a given Addon!
     * @param {!Addon | ParallelAddon} addon addon
     * @returns {Promise<Addon>}
     *
     * @this Core
     */
    async setupAddonListener(addon) {
        /** @type {{name: string, callbacks: string[], lockOn: string[]}} */
        const { name, callbacks, lockOn = [] } = await addon.executeCallback("get_info");

        let messageHandler = null;
        if (ParallelAddon.isParallelAddon(addon)) {
            for (const addonName of lockOn) {
                addon.locks.set(addonName, null);
            }

            /**
             * @async
             * @function messageHandler
             * @description Handle addon message!
             * @param {!string} messageId messageId
             * @param {!string} target target
             * @param {any[]} args Callback arguments
             * @returns {void}
             */
            messageHandler = async(messageId, target, args) => {
                const header = { from: target, id: messageId };

                noTarget: if (!this.routingTable.has(target)) {
                    await new Promise((resolve) => setTimeout(resolve, 750));
                    if (this.routingTable.has(target)) {
                        break noTarget;
                    }

                    this.stdout(`Unable to found (callback) target '${target}' requested by addon '${name}'`);
                    addon.ipc.send("response", { header, data: {
                        error: `Unable to found (callback) target '${target}' requested by addon '${name}'`
                    } });

                    return;
                }

                try {
                    const body = await this.routingTable.get(target)(messageId, name, args);

                    const isObj = is.object(body);
                    if (isObj && !is.nullOrUndefined(body.error)) {
                        throw new Error(body.error);
                    }

                    if (isStream(body)) {
                        const wS = new IPC.Stream();
                        addon.ipc.send("response", wS);
                        for await (const buf of body) {
                            wS.write({ header, data: { body: buf.toString(), completed: false } });
                        }
                        wS.write({ header, data: { completed: true } });
                        wS.end();
                    }
                    else {
                        addon.ipc.send("response", { header, data: { body } });
                    }
                }
                catch (error) {
                    addon.ipc.send("response", { header, data: { error: error.message } });
                }
            };
        }
        else {
            /**
             * @async
             * @function messageHandler
             * @description Handle addon message!
             * @param {!string} messageId messageId
             * @param {!string} target target
             * @param {any[]} args Callback arguments
             * @returns {void}
             */
            messageHandler = async(messageId, target, args) => {
                noTarget: if (!this.routingTable.has(target)) {
                    await new Promise((resolve) => setTimeout(resolve, 750));
                    if (this.routingTable.has(target)) {
                        break noTarget;
                    }

                    this.stdout(`Unable to found (callback) target '${target}' requested by addon '${name}'`);
                    if (!addon.observers.has(messageId)) {
                        return;
                    }

                    const observer = addon.observers.get(messageId);
                    observer.error(`Unable to found (callback) target '${target}' requested by addon '${name}'`);

                    return;
                }

                try {
                    const body = await this.routingTable.get(target)(messageId, name, args);
                    if (!addon.observers.has(messageId)) {
                        return;
                    }

                    const isObj = is.object(body);
                    if (isObj && !is.nullOrUndefined(body.error)) {
                        throw new Error(body.error);
                    }

                    const observer = addon.observers.get(messageId);
                    if (isStream(body)) {
                        for await (const buf of body) {
                            observer.next(buf.toString());
                        }
                    }
                    else {
                        observer.next(body);
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
                this.stdout(`Setup routing target: ${name}.${callback}`);
                // eslint-disable-next-line
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
     * @function exit
     * @description Exit the core properly
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
        const callbacks = [...this.addons.values()].map((addon) => addon.executeCallback("stop"));
        await Promise.all([
            ...callbacks,
            this.config.close(),
            this.logger.close()
        ]);

        this.hasBeenInitialized = false;
    }
}

// Default Core Configuration
Core.DEFAULT_CONFIGURATION = {
    addons: {}
};

// Default Core Configuration JSON Schema
Core.DEFAULT_SCHEMA = require("./config/agent.schema.json");
