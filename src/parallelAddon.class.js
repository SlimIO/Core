// Require Node.JS dependencies
const { join } = require("path");
const { fork } = require("child_process");

// Require Third-party Dependencies
const SafeEmitter = require("@slimio/safe-emitter");
const IPC = require("@slimio/ipc");
const uuid = require("uuid/v4");

// SCRIPT CONSTANTS
const FORK_CONTAINER_PATH = join(__dirname, "forked.container.js");

/**
 * @func defaultHeader
 * @desc Generate Default ParralelAddon callback header
 * @return {Object}
 */
function defaultHeader() {
    return { from: "core", id: uuid() };
}

/**
 * @class ParallelAddon
 * @extends SafeEmitter
 *
 * @property {String} root Addon root path
 * @property {String} addonName name of the Wrappered addon
 * @property {IPC} ipc IPC Module
 */
class ParallelAddon extends SafeEmitter {
    /**
     * @constructor
     * @param {!String} root root directory
     * @param {!String} addonName addonName
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

        this.root = root;
        this.addonName = addonName;
    }

    /**
     * @method createForkProcesses
     * @desc Create and Fork a new Processes!
     * @memberof ParallelAddon
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
     * @method executeCallback
     * @desc Polyfill of Addon.executeCallback with forked process!
     * @param {!String} callback callback name
     * @param {*} header callback header
     * @param {any[]} args args
     * @returns {Promise<any>}
     *
     * @throws {Error}
     */
    async executeCallback(callback, header = defaultHeader(), ...args) {
        const { data: { body, error } } = await this.ipc.send("message", { header, data: { callback, args } });
        if (error) {
            throw new Error(error);
        }

        return body;
    }
}

module.exports = ParallelAddon;
