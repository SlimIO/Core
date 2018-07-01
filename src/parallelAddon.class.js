// Require Node.JS dependencies
const { join } = require("path");
const { fork } = require("child_process");
const events = require("events");

// Require Third-party Dependencies
const is = require("@sindresorhus/is");
const uuidv4 = require("uuid/v4");

// Fork wrapper path
const forkWrapper = join(__dirname, "forked.container.js");

/**
 * @class ParallelAddon
 * @classdesc Addon Emulation!
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
        this.on("error", console.error);
        if (!is.string(root)) {
            throw new TypeError("EmulateAddon->root should be typeof <string>");
        }
        if (!is.string(addonName)) {
            throw new TypeError("EmulateAddon->addonName should be typeof <string>");
        }

        // Setup properties
        this.root = root;
        this.addonName = addonName;
        this.isStarted = false;
        this.messageEvents = new events.EventEmitter();

        /** @type {WeakSet<String>} */
        this.memoryIds = new WeakSet();

        /** @type {ChildProcesses} */
        this.cp = null;

        // Listen for event
        this.on("start", () => {
            this.isStarted = true;
        });

        this.on("stop", () => {
            this.isStarted = false;
        });
    }

    /**
     * @async
     * @method createForkProcesses
     * @returns {Promise<this>}
     */
    createForkProcesses() {
        // Setup CP
        this.cp = fork(forkWrapper, [this.root]);
        this.cp.on("error", console.error);
        this.cp.on("message", this.messageHandler);
        this.cp.on("close", (code) => {
            console.log(`Addon close with code: ${code}`);
        });

        return this;
    }

    /**
     * @async
     * @method executeCallback
     * @param {!String} name name
     * @param {any[]} args args
     * @returns {Promise<any>}
     */
    executeCallback(name, args) {
        if (is.nullOrUndefined(this.cp)) {
            throw new Error("ChildProcesses not defined!");
        }

        /** @type {String} */
        const messageId = uuidv4();

        // Send message at the next loop iteration!
        setImmediate(() => {
            this.memoryIds.add(messageId);
            this.cp.send({ messageId, callback: name, args });
        });

        // Wait for a response!
        return new Promise((resolve, reject) => {
            /** @type {NodeJS.Timer} */
            let timer = null;
            function listener(body) {
                clearTimeout(timer);
                resolve(body);
            }

            timer = setTimeout(() => {
                this.messageEvents.removeListener(messageId, listener);
                this.memoryIds.delete(messageId);
                reject(new Error("timeout"));
            }, 2000);
            this.messageEvents.once(messageId, listener);
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
        console.log(`CP Message from ${this.addonName} with target: ${target} & body ${body}`);
        if (ParallelAddon.selfEvents.has(target)) {
            if (target === "message") {
                if (this.memoryIds.has(messageId)) {
                    this.memoryIds.delete(messageId);
                    this.messageEvents.emit(messageId, body);
                }
            }
            else {
                this.emit(target);
            }
        }
        else {
            this.emit("message", messageId, args);
        }
    }

}
ParallelAddon.selfEvents = new Set(["start", "stop", "message"]);

module.exports = ParallelAddon;
