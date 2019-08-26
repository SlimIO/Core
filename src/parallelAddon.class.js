// Require Node.js dependencies
import { resolve } from "path";
import { fork } from "child_process";

// Require Third-party Dependencies
import SafeEmitter from "@slimio/safe-emitter";
import IPC from "@slimio/ipc";
import uuid from "uuid";

// CONSTANTS
const FORK_CONTAINER_PATH = resolve("forked.container.js");
const SYM_PARALLEL = Symbol.for("ParallelAddon");

/**
 * @function defaultHeader
 * @description Generate Default ParralelAddon callback header
 * @returns {object}
 */
function defaultHeader() {
    return { from: "core", id: uuid.v4() };
}

export default class ParallelAddon extends SafeEmitter {
    /**
     * @class ParallelAddon
     * @augments SafeEmitter
     * @param {!string} root root directory
     * @param {!string} addonName addonName
     *
     * @throws {TypeError}
     */
    constructor(root, addonName) {
        super();
        if (typeof root !== "string") {
            throw new TypeError("root should be typeof <string>");
        }
        if (typeof addonName !== "string") {
            throw new TypeError("addonName should be typeof <string>");
        }

        this[SYM_PARALLEL] = true;
        this.root = root;
        this.name = addonName;
        this.locks = new Map();
    }

    /**
     * @static
     * @function isParallelAddon
     * @memberof Addon#
     * @param {!any} obj
     * @returns {boolean}
     */
    static isParallelAddon(obj) {
        return obj && Boolean(obj[SYM_PARALLEL]);
    }

    /**
     * @function createForkProcesses
     * @description Create and Fork a new Processes!
     * @memberof ParallelAddon#
     * @returns {void}
     */
    createForkProcesses() {
        // If there is already a Child Processses running, then return
        if (typeof this.ipc !== "undefined") {
            return void 0;
        }

        const cp = fork(FORK_CONTAINER_PATH, [this.root]);
        this.ipc = new IPC(cp);

        // Catch events
        this.ipc.on("event", (name, next) => {
            this.emit(name);
            next();
        });

        // Catch messages
        this.ipc.on("message", (payload, next) => {
            const { header, data } = payload;
            this.emit("message", header.id, data.target, data.args);
            next();
        });

        this.on("addonLoaded", (from) => this.ipc.send("event", { from, name: "addonLoaded" }));

        return void 0;
    }

    /**
     * @async
     * @function executeCallback
     * @description Polyfill of Addon.executeCallback with forked process!
     * @memberof ParallelAddon#
     * @param {!string} callback callback name
     * @param {*} header callback header
     * @param {any[]} args args
     * @returns {Promise<any>}
     *
     * @throws {Error}
     */
    async executeCallback(callback, header = defaultHeader(), ...args) {
        const { data } = await this.ipc.send("message", { header, data: { callback, args } });
        if (data.error) {
            throw new Error(data.error);
        }

        return data.body;
    }
}
