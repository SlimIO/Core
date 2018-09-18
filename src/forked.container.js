// Get the forked addon !
const [addonPath] = process.argv.slice(2);
if (typeof addonPath !== "string") {
    throw new TypeError("fork.wrapper --addonPath should be typeof <string>");
}

// Require Internal Dependencies
const Addon = require("@slimio/addon");

/**
 * @type {Addon}
 * @todo Replace require by lazy import when possible!
 */
const addon = require(addonPath);
if (!(addon instanceof Addon)) {
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
    async function message({ messageId, callback, body, args = [] }) {
        if (typeof body !== "undefined") {
            const observer = addon.observers.get(messageId);
            observer.next(body);
            observer.complete();

            return void 0;
        }

        try {
            const body = await addon.executeCallback(callback, ...args);
            process.send({ messageId, body });
        }
        catch (error) {
            process.send({ messageId, body: error.message });
        }

        return void 0;
    }
    process.on("message", message);

    // Setup start listener
    addon.on("start", () => {
        console.log(`Addon ${name} started!`);
        addon.on("message", sendMessage);
        process.send({ target: "start" });
    });

    // Setup stop listener
    addon.on("stop", () => {
        console.log(`Addon ${name} stopped!`);
        addon.removeAllListeners("message", message);
        process.send({ target: "stop" });
        setImmediate(process.exit);
    });
}

// Call main handler
main().catch(function mainErrorHandler(error) {
    console.error(error);
    process.exit(1);
});
