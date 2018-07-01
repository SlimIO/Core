// Require Internal Dependencies
const Addon = require("@slimio/addon");

// Get the forked addon !
const [addonPath] = process.argv.slice(2);
if (typeof addonPath !== "string") {
    throw new TypeError("fork.wrapper --addonPath should be typeof <string>");
}

/**
 * @typedef {Object} ProcessesMessage
 * @property {!String} messageId
 * @property {!String} callback
 * @property {any[]} args
 */

async function main() {
    /** @type {Addon} */
    const addon = require(addonPath);
    if (addon instanceof Addon === false) {
        throw new TypeError("fork.wrapper addon entry file should be a SlimIO Addon");
    }

    /** @type {{name: string}} */
    const { name } = await addon.executeCallback("get_info");

    /**
     * @async
     * @func message
     * @param {ProcessesMessage} payload message payload
     * @returns {Promise<void>}
     */
    async function message({ messageId, callback, args = [] }) {
        console.log(`Receiving message with id ${messageId}, callback ${callback}`);
        try {
            const body = await addon.executeCallback(callback, ...args);
            process.send({ messageId, body });
        }
        catch (error) {
            process.send({ messageId, body: error.message });
        }
    }
    process.on("message", message);

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

    // Setup start listener
    addon.on("start", () => {
        console.log(`Addon ${name} started!`);
        process.send({ target: "start" });
        addon.on("message", sendMessage);
    });

    // Setup stop listener
    addon.on("stop", () => {
        console.log(`Addon ${name} stopped!`);
        process.send({ target: "stop" });
        addon.removeAllListeners("message", message);
        setImmediate(process.exit);
    });
}

// Call main handler
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
