const Core = require("../src/core.class");

async function main() {
    console.time("init");
    Core.root = __dirname;
    const core = await (new Core()).initialize();
    console.timeEnd("init");

    setImmediate(async() => {
        console.time("start");
        await core.executeCallback("start");
        console.timeEnd("start");
    });
}
main().catch(console.error);
