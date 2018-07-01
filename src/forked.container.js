// Require Internal Dependencies
const Addon = require("@slimio/addon");

// Get fork start arguments
const [addonPath] = process.argv.slice(2);
if (typeof addonPath !== "string") {
    throw new TypeError("fork.wrapper --addonPath should be typeof <string>");
}

/**
 * @async
 * @func message
 * @param {!String} messageId messageId
 * @param {!String} target target
 * @param {any[]} args args
 * @returns {Promise<void>}
 */
async function message(messageId, target, args) {
    // Send message into the process!
}

async function main() {
    /** @type {Addon} */
    const addon = require(addonPath);
    if (addon instanceof Addon === false) {
        throw new TypeError("fork.wrapper addon entry file should be a SlimIO Addon");
    }

    /** @type {{name: string}} */
    const { name } = await addon.executeCallback("get_info");

    // Setup start listener
    addon.on("start", () => {
        console.log(`Addon ${name} started!`);
        process.send({
            content: "start"
        });
        addon.on("message", message);
    });

    // Setup stop listener
    addon.on("stop", () => {
        console.log(`Addon ${name} stopped!`);
        process.send({
            content: "stop"
        });
        addon.removeAllListeners("message", message);
    });
}

// Call main handler
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
