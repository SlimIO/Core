// Require Internal Dependencies
const Addon = require("@slimio/addon");

// Declare Addon
const cpu = new Addon("cpu");

/** @type {NodeJS.Timer} */
let addonInterval;

function interval() {
    // console.log("CPU Interval triggered!");
}

async function test() {
    return "hello world!";
}
cpu.registerCallback(test);

cpu.on("start", () => {
    addonInterval = setInterval(interval, 3000);
});

cpu.on("stop", () => {
    clearInterval(addonInterval);
});

cpu.once("init", () => {
    console.log("cpu addon initialized");
});

module.exports = cpu;
