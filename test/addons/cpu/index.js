// Require Internal Dependencies
const Addon = require("@slimio/addon");

// Declare Addon
const cpu = new Addon("cpu");

cpu.registerCallback(async function test() {
    return true;
});

cpu.on("init", () => {
    console.log("cpu addon initialized");
});

setInterval(function interval() {
    if (!cpu.isStarted) {
        return;
    }
    console.log("CPU Interval triggered!");
}, 1000);
module.exports = cpu;
