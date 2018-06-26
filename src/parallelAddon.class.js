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
        this.cp = null;

        this.on("start", this.start);
    }

    /**
     * @async
     * @method start
     * @returns {Promise<this>}
     */
    async start() {
        // Setup CP
        this.cp = fork(forkWrapper, [this.root]);
        this.cp.on("error", console.error);
        this.cp.on("message", this.messageHandler);
        this.cp.on("close", this.close);

        return this;
    }

    executeCallback(name, args) {

    }

    sendMessage() {

    }

    /**
     * @method messageHandler
     * @param {Object} options options
     * @param {!String} [options.subject="emitter"] message subject
     * @param {!String} options.content message content
     * @returns {void}
     */
    messageHandler({ subject = "emitter", content }) {
        console.log(`CP Message from ${this.addonName} with Subject: ${subject} & content ${content}`);
        switch (subject) {
            case "emitter":
                this.emit(content);
                break;
            case "message":
                break;
            default:
                break;
        }
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
