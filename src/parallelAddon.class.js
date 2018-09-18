// Require Node.JS dependencies
const { join } = require("path");
const { fork } = require("child_process");
const events = require("events");

// Require Third-party Dependencies
const uuidv4 = require("uuid/v4");

// SCRIPT CONSTANTS
const FORK_CONTAINER_PATH = join(__dirname, "forked.container.js");
const MESSAGE_TIMEOUT_MS = 250;

/**
 * @class ParallelAddon
 * @classdesc Addon Emulation!
 *
 * @property {String} root Addon root path
 * @property {String} addonName name of the Wrappered addon
 * @property {Boolean} isStarted Boolean value to know if the addon is started or not
 * @property {ChildProcesses} cp Node.JS Child Processes reference!
 * @property {NodeJS.EventEmitter} messageEvents Message events container
 */
class ParallelAddon extends events {

    /**
     * @constructor
     * @param {!String} root root directory
     * @param {!String} addonName addonName
     *
     * @throws {TypeError}
     */
    constructor(root, addonName) {
        super();
        // Listen for errors on the events container!
        this.on("error", console.error);

        // Check arguments types (they should be both string) !
        if (typeof root !== "string") {
            throw new TypeError("EmulateAddon->root should be typeof <string>");
        }
        if (typeof addonName !== "string") {
            throw new TypeError("EmulateAddon->addonName should be typeof <string>");
        }

        // Setup ParallelAddon properties
        this.root = root;
        this.addonName = addonName;
        this.isStarted = false;
        /** @type {ChildProcess} */
        this.cp = null;
        this.messageEvents = new events.EventEmitter();
        this.messageEvents.setMaxListeners(3);

        // Listen for events "start" and "stop"
        this.on("start", () => {
            this.isStarted = true;
        });

        this.on("stop", () => {
            this.isStarted = false;
            this.cp = null;
        });
    }

    /**
     * @method createForkProcesses
     * @memberof ParallelAddon
     * @returns {void}
     */
    createForkProcesses() {
        // If there is already a Child Processses running, then return
        if (typeof this.cp !== undefined && this.cp !== null) {
            return void 0;
        }

        this.cp = fork(FORK_CONTAINER_PATH, [this.root]);
        this.cp.on("error", console.error);
        this.cp.on("message", this.messageHandler.bind(this));
        this.cp.on("close", (code) => {
            console.log(`Addon ${this.addonName} closed with signal code: ${code}`);
        });

        return void 0;
    }

    /**
     * @async
     * @method executeCallback
     * @param {!String} name name
     * @param {any[]} args args
     * @returns {Promise<any>}
     *
     * @throws {Error}
     */
    executeCallback(name, args) {
        /** @type {String} */
        const messageId = uuidv4();
        this.cp.send({ messageId, callback: name, args });

        // Wait for a response!
        return new Promise((resolve, reject) => {
            /** @type {NodeJS.Timer} */
            let timer = null;

            function listener(body) {
                clearTimeout(timer);
                resolve(body);
            }
            this.messageEvents.once(messageId, listener);

            timer = setTimeout(() => {
                this.messageEvents.removeListener(messageId, listener);
                reject(new Error(
                    `(ParrallelAddon) Message id ${messageId} reached the timeout time of ${MESSAGE_TIMEOUT_MS}`
                ));
            }, MESSAGE_TIMEOUT_MS);
        });
    }

    /**
     * @method messageHandler
     * @param {Object} options options
     * @param {!String} [options.target="message"] message target
     * @param {any} options.body message content
     * @param {String} options.messageId messageId
     * @param {any[]} options.args args
     * @returns {void}
     */
    messageHandler({ target = "message", body, messageId = "", args }) {
        if (target === "start" || target === "stop") {
            this.emit(target);
        }
        else if (target === "message") {
            this.messageEvents.emit(messageId, body);
        }
        else {
            this.emit("message", messageId, target, args);
        }
    }

}

module.exports = ParallelAddon;
