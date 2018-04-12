const Addon = require("@slimio/addon");
const cpu = new Addon("cpu");

cpu.registerCallback("test", async() => {
    return true;
});

cpu.on("init", function init() {
    console.log("init triggered!");
});
cpu.on("start", function start() {
    console.log("start triggered");
});

module.exports = cpu;
