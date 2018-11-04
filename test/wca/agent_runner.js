const [directory] = process.argv.slice(2);
const Core = require("../..");

function errorHandler(error) {
    console.error(error);
    process.exit(1);
}

async function main() {
    const core = new Core(directory, {
        silent: true
    });
    await core.initialize();

    // Handle exit signal!
    process.on("SIGINT", () => {
        console.error("EXITING AGENT");
        core.exit().then(() => {
            setImmediate(process.exit);
        }).catch(errorHandler);
    });
}
main().catch(errorHandler);
