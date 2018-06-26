const Core = require("../src/core.class");

/**
 * @async
 * @function main
 * @returns {Promise<void>}
 */
async function main() {
    console.time("start_core");
    const core = new Core(__dirname);
    await core.initialize();
    console.timeEnd("start_core");

    // Handle exit signal!
    process.on("SIGINT", async() => {
        console.error("Exiting SlimIO Agent (please wait)");
        await core.exit().catch(console.error);
        process.exit(0);
    });
}
main().catch(console.error);
