// Require Node.js dependencies
import { existsSync, promises as fs } from "fs";
import { join } from "path";
import { createRequire } from "module";
import { fileURLToPath as fromURL, pathToFileURL } from "url";
import os from "os";

// Require Third-party dependencies
import Config from "@slimio/config";
import is from "@slimio/is";
import oop from "@slimio/oop";
import IPC from "@slimio/ipc";
import Logger from "@slimio/logger";
import isStream from "is-stream";
import semver from "semver";

// Require Internal Dependencies
import { searchForAddons, generateDump, searchForLockedAddons } from "./utils.js";
import ParallelAddon from "./parallelAddon.class.js";

// CONSTANTS
const SYM_ADDON = Symbol.for("Addon");

// Vars
const __filename = fromURL(import.meta.url);
const require = createRequire(__filename);

/** @typedef {{ active: boolean, standalone: boolean? }} AddonProperties */
/** @typedef {object.<string, AddonProperties>} AddonCFG */

export default class Core {
    #hasBeenStarted = false;
    #logger = new Logger(void 0, { title: "core" });

    /** @type {Map<string, Addon.Callback>} */
    routingTable = new Map();

    /** @type {Map<string, Addon>} */
    addons = new Map();

    /**
     * @class Core
     * @param {!string} dirname The directory name where you want to start a core.
     * @param {object} [options={}] options
     * @param {number} [options.autoReload=500] autoReload configuration
     * @param {boolean} [options.silent] configure core to be silent
     * @param {boolean} [options.toml] enable TOML configuration
     */
    constructor(dirname, options = Object.create(null)) {
        const localOptions = oop.toPlainObject(options);
        this.root = oop.toString(dirname);
        this.silent = oop.toNullableBoolean(localOptions.silent) ?? false;

        const autoReload = is.bool(localOptions.autoReload) || is.number(localOptions.autoReload);
        const reloadDelay = is.number(localOptions.autoReload) ? localOptions.autoReload : 500;
        this.#logger.writeLine(
            `autoreload ${autoReload ? "enabled" : "disabled"} ${autoReload ? `(with a delay of ${reloadDelay}ms)` : ""}`);

        if (existsSync(join(this.root, "agent.toml"))) {
            localOptions.toml = true;
        }

        // eslint-disable-next-line no-extra-boolean-cast
        const configName = Boolean(options.toml) ? "agent.toml" : "agent.json";
        this.config = new Config(join(this.root, configName), {
            createOnNoEntry: true,
            writeOnSet: true,
            autoReload,
            defaultSchema: Core.DEFAULT_SCHEMA,
            reloadDelay
        });

        global.slimio_core = this;
    }

    /**
     * @public
     * @function stdout
     * @description stdout message
     * @param {string} msg message to put stdout
     * @memberof Core#
     * @returns {void}
     */
    stdout(msg) {
        !this.silent && this.#logger.writeLine(msg);
    }

    /**
     * @public
     * @async
     * @function start
     * @description Start the core (load configuration, establish a list of addons to pre-load before start phase)
     * @memberof Core#
     * @returns {Promise<this>}
     */
    async start() {
        await fs.mkdir(join(this.root, "debug"), { recursive: true });
        await this.config.read(Core.DEFAULT_CONFIGURATION);

        /** @type {AddonCFG} */
        let addonsCfg = this.config.get("addons");

        // If the configuration is empty then we search for addons on the file system.
        // Most of the time this path is only taken at the first start of the agent.
        if (Object.keys(addonsCfg).length === 0) {
            this.stdout("Searching for addons locally");
            addonsCfg = await searchForAddons(this.root);
            this.config.set("addons", addonsCfg);
        }

        // Watch for configuration update on the 'addons' key.
        this.config.observableOf("addons").subscribe(
            (curr) => {
                for (const [addonName, config] of Object.entries(curr)) {
                    this.setupAddonConfiguration(addonName, config)
                        .catch((err) => generateDump(this.root, err));
                }
            },
            (error) => generateDump(this.root, error)
        );

        this.#hasBeenStarted = true;
        if (process.send) {
            setImmediate(() => process.send("agent_started"));
        }

        return this;
    }

    /**
     * @public
     * @async
     * @function stop
     * @description Stop the core and close (free) all ressources properly (loggers, configs, addons).
     * @memberof Core#
     * @returns {Promise<this>}
     */
    async stop() {
        if (!this.#hasBeenStarted) {
            return this;
        }

        const callbacks = [...this.addons.values()].map((addon) => addon.executeCallback("stop"));
        await Promise.allSettled([
            ...callbacks, this.config.close(), this.#logger.close()
        ]);

        this.#hasBeenStarted = false;

        return this;
    }

    get isStarted() {
        return this.#hasBeenStarted;
    }

    /**
     * @async
     * @private
     * @public
     * @function setupAddonConfiguration
     * @description This function is triggered when an Observed addon is updated!
     * @memberof Core#
     * @param {!string} addonName addonName
     * @param {AddonProperties} [options] new addon Configuration
     * @returns {Promise<void>} Return Async clojure
     */
    async setupAddonConfiguration(addonName, options = Object.create(null)) {
        const { active, standalone } = options;
        const coreHasAddonInMemory = this.addons.has(addonName);
        const isStandalone = os.cpus().length > 1 ? standalone : false;

        /** @type {Addon} */
        let addon = coreHasAddonInMemory ? this.addons.get(addonName) : null;

        // If the addon has not been loaded then we load it.
        if (!coreHasAddonInMemory) {
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

                    const requiredVersion = addon.constructor.REQUIRED_CORE_VERSION ?? "*";
                    if (!semver.satisfies(global.coreVersion, requiredVersion)) {
                        // eslint-disable-next-line
                        throw new Error(`Addon '${addonName}' (${addonEntryFile}) container version doens't satifies the core version '${global.coreVersion}' with range of '${requiredVersion}'`);
                    }

                    // Setup auto ready if there is no start/awake event.
                    const listenerCount = addon.listenerCount("start") + addon.listenerCount("awake");
                    if (listenerCount === 0) {
                        addon.on("awake", () => addon.ready());
                    }

                    addon.catch((error, eventName) => {
                        if (eventName === "start") {
                            addon.executeCallback("stop");
                        }
                        const dumpFile = generateDump(this.root, error);
                        this.#logger.writeLine(
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
                this.#logger.writeLine(`An error occured while loading addon ${addonName} (ERROR dumped in: ${dumpFile})`);

                return void 0;
            }
        }

        const stateToBeTriggered = active ? "start" : "stop";
        try {
            if (ParallelAddon.isParallelAddon(addon) && active && isStandalone) {
                addon.createForkProcesses();
            }

            if (stateToBeTriggered === "stop") {
                for (const name of searchForLockedAddons(this.addons, addonName)) {
                    this.addons.get(name).executeCallback("sleep");
                }
            }
            setImmediate(() => addon.executeCallback(stateToBeTriggered));
        }
        catch (error) {
            const dumpFile = generateDump(this.root, error);
            this.#logger.writeLine(
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
        /** @type {Addon.Status} */
        const { name, lockOn = [], ...status } = await addon.executeCallback("status");
        const callbacks = Object.keys(status.callbacks);

        let messageHandler = null;
        if (ParallelAddon.isParallelAddon(addon)) {
            for (const addonName of lockOn) {
                addon.locks.set(addonName, null);
            }

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

        addon.prependListener("stop", () => {
            addon.removeEventListener("message", messageHandler);
            for (const target of callbacks) {
                this.routingTable.delete(`${name}.${target}`);
            }
        });

        return addon;
    }
}

// Default Core Configuration
Core.DEFAULT_CONFIGURATION = {
    addons: {}
};

// Default Core Configuration JSON Schema
Core.DEFAULT_SCHEMA = require("./config/agent.schema.json");
