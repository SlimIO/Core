// Require Node.JS dependencies
const { join } = require("path");
const { fork } = require("child_process");

// Require Third-party Dependencies
const uuid = require("uuid/v4");
const SafeEmitter = require("@slimio/safe-emitter");

// SCRIPT CONSTANTS
const FORK_CONTAINER_PATH = join(__dirname, "forked.container.js");
const MESSAGE_TIMEOUT_MS = 750;

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
 * @property {ChildProcesses} cp Node.JS Child Processes reference!
 * @property {SafeEmitter} events Message events container
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
        this.callbackResponse = new SafeEmitter();
    }

    /**
     * @method createForkProcesses
     * @desc Create and Fork a new Processes!
     * @memberof ParallelAddon
     * @returns {void}
     */
    createForkProcesses() {
        // If there is already a Child Processses running, then return
        if (typeof this.cp !== "undefined") {
            return void 0;
        }

        this.cp = fork(FORK_CONTAINER_PATH, [this.root]);
        this.cp.on("error", console.error);
        this.cp.on("message", ({ target, header, data }) => {
            switch (target) {
                case 1:
                    this.callbackResponse.emit(header.id, data.body, data.error);
                    break;
                case 2:
                    this.emit("message", header.id, data.target, data.args);
                    break;
                case 3:
                    this.emit(data);
                    break;
                default:
                    // Do nothing on default
            }
        });
        this.cp.on("close", (code) => {
            console.log(`Addon ${this.addonName} closed with signal code: ${code}`);
        });

        this.on("addonLoaded", (addonName) => {
            this.cp.send({ target: 3, header: { from: addonName }, data: "addonLoaded" });
        });

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
        this.cp.send({ target: 1, header, data: { callback, args } });
        let body;
        let error;

        try {
            // How to catch multiple messages ?
            [body, error = null] = await this.callbackResponse.once(header.id, MESSAGE_TIMEOUT_MS);
        }
        catch (error) {
            throw new Error(`(ParrallelAddon) Message id ${header.id} timeout (${MESSAGE_TIMEOUT_MS}ms)`);
        }
        if (error !== null) {
            throw new Error(error);
        }

        return body;
    }
}

module.exports = ParallelAddon;
