const Core = require("./src/core.class");

async function main() {
    const agent = new Core();
    await agent.initialize();
}
main().catch(console.error);
