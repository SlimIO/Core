// Require Third-party Dependencies
const is = require("@sindresorhus/is");

// Require Internal Dependencies
const Addon = require("@slimio/addon");

// Get fork start arguments
const [addonPath] = process.argv.slice(2);
if (!is.string(addonPath)) {
    throw new TypeError("fork.wrapper --addonPath should be typeof <string>");
}

async function message(messageId, target, args) {
    // Send message into the process!
}

async function main() {
    // Require addon
    const addon = require(addonPath);
    if (addon instanceof Addon === false) {
        throw new TypeError("fork.wrapper addon entry file should be a SlimIO Addon");
    }

    // Execute get_info callback
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

    // Emit init
    addon.isConnected = true;
    addon.emit("init");
    process.send({
        content: "init"
    });
}

// Call main handler
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
