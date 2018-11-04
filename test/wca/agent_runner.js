const [directory] = process.argv.slice(2);
console.log(`Agent runner triggered with directory: ${directory}`);
const Core = require("../..");

function errorHandler(error) {
    console.error(error);
    process.exit(1);
}

async function main() {
    const core = new Core(directory, {
        silent: false
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
