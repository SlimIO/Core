// Require Internal Dependencies
const Addon = require("@slimio/addon");

// Declare Addon
const cpu = new Addon("cpu");

// eslint-disable-next-line
async function test() {
    return "hello world!";
}
cpu.registerCallback(test);

cpu.on("start", () => {
    cpu.ready();
});

module.exports = cpu;
