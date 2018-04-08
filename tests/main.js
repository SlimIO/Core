const Core = require("../src/core.class");

async function main() {
    Core.root = __dirname;
    const core = await (new Core()).initialize();
}
main().catch(console.error);
