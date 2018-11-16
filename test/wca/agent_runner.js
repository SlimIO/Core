const [directory] = process.argv.slice(2);
const Core = require("../..");

console.log(process.env.NODE_V8_COVERAGE);

function errorHandler() {
    console.log("> TEST FAILED!");
    process.exit(1);
}

async function main() {
    const core = new Core(directory, {
        silent: true
    });
    await core.initialize();

    // Handle exit signal!
    process.on("SIGINT", () => {
        core.exit().then(() => {
            setImmediate(process.exit);
        }).catch(errorHandler);
    });
}
main().catch(errorHandler);
