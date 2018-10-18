require("make-promises-safe");

// Get the forked addon !
const [addonPath] = process.argv.slice(2);
if (typeof addonPath !== "string") {
    throw new TypeError("fork.wrapper --addonPath should be typeof <string>");
}

/**
 * @type {Addon}
 * @todo Replace require by lazy import when possible!
 */
const addon = require(addonPath);
if (addon.constructor.name !== "Addon") {
    throw new TypeError("fork.wrapper addon entry file should be a SlimIO Addon");
}

// Catch SIGINT Signal
process.on("SIGINT", (signal) => {
    console.log(`Receiving signal : ${signal}`);
});

/**
 * @typedef {Object} ProcessesMessage
 * @property {!String} messageId
 * @property {!String} callback
 * @property {any=} body
 * @property {String=} error
 * @property {any[]} args
 */

/**
 * @func sendMessage
 * @param {!String} messageId messageId
 * @param {!String} target message target
 * @param {*} args args
 * @returns {void}
 */
function sendMessage(messageId, target, args) {
    process.send({ messageId, target, args });
}

/**
 * @async
 * @function main
 * @return {Promise<void>}
 */
async function main() {
    /** @type {{name: string}} */
    const { name } = await addon.executeCallback("get_info");

    /**
     * @async
     * @func message
     * @param {ProcessesMessage} payload message payload
     * @returns {Promise<void>}
     */
    async function message({ messageId, callback, body, error, args = [] }) {
        if (typeof body !== "undefined") {
            const observer = addon.observers.get(messageId);
            observer.next(body);
            observer.complete();

            return void 0;
        }
        if (error !== null) {
            addon.observers.get(messageId).error(new Error(error));

            return void 0;
        }

        try {
            const body = await addon.executeCallback(callback, ...args);
            process.send({ messageId, body, error: null });
        }
        catch (error) {
            process.send({ messageId, body: null, error: error.message });
        }

        return void 0;
    }
    process.on("message", message);

    // Setup ready listener
    addon.on("ready", () => {
        console.log(`Addon ${name} ready!`);
        process.send({ target: "ready", error: null });
    });

    // Setup start listener
    addon.on("start", () => {
        console.log(`Addon ${name} started!`);
        addon.on("message", sendMessage);
        process.send({ target: "start", error: null });
    });

    // Setup stop listener
    addon.on("stop", () => {
        console.log(`Addon ${name} stopped!`);
        addon.removeAllListeners("message", message);
        process.send({ target: "stop", error: null });
        setImmediate(process.exit);
    });
}

// Call main handler
main().catch(function mainErrorHandler(error) {
    console.error(error);
    process.exit(1);
});
