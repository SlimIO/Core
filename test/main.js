const Core = require("../src/core.class");

function nextLoopIteration() {
    return new Promise((resolve) => {
        setImmediate(resolve);
    });
}

async function main() {
    console.time("init");
    const core = await (new Core(__dirname)).initialize();
    console.timeEnd("init");

    // Wait next loop iteration
    await nextLoopIteration();

    // Start all addons!
    console.time("start");
    await Promise.all(
        core.addons.map((addon) => addon.executeCallback("start"))
    );
    console.timeEnd("start");
}
main().catch(console.error);
