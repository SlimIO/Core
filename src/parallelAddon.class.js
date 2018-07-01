// Require Node.JS dependencies
const { join } = require("path");
const { fork } = require("child_process");
const events = require("events");

// Require Third-party Dependencies
const is = require("@sindresorhus/is");

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
        this.cp.on("close", this.close);

        return this;
    }

    /**
     * @method executeCallback
     * @param {!String} name name
     * @param {any[]} args args
     * @returns {void}
     */
    executeCallback(name, args) {
        if (is.nullOrUndefined(this.cp)) {
            throw new Error("ChildProcesses not defined!");
        }
        this.cp.send({});
    }

    /**
     * @method messageHandler
     * @param {Object} options options
     * @param {!String} [options.target="addon"] message subject
     * @param {any} options.body message content
     * @param {String} options.messageId messageId
     * @returns {void}
     */
    messageHandler({ target = "addon", body, messageId = "" }) {
        console.log(`CP Message from ${this.addonName} with target: ${target} & body ${body}`);
        if (target === "addon") {
            if (!this.memoryIds.has(messageId)) {
                return;
            }

            return;
        }
        if (!is.string(body)) {
            return;
        }
        this.emit(body);
    }

    /**
     * @method close
     * @param {!Number} code close code
     * @returns {void}
     */
    close(code) {
        console.log(`Addon close with code: ${code}`);
    }

}

module.exports = ParallelAddon;
