const Core = require("../src/core.class");

async function main() {
    console.time("start");
    Core.root = __dirname;
    const core = await (new Core()).initialize();
    console.timeEnd("start");
}
main().catch(console.error);
