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
        this.messageEvents.setMaxListeners(3);

        /** @type {NodeJS.ChildProcesses} */
        this.cp = fork(forkWrapper, [this.root]);
        this.cp.on("error", console.error);
        this.cp.on("message", this.messageHandler.bind(this));
        this.cp.on("close", (code) => {
            console.log(`Addon ${addonName} closed with signal code: ${code}`);
        });


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
                reject(new Error("timeout"));
            }, 125);
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
