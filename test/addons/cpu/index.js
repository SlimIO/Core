const Addon = require("@slimio/addon");
const cpu = new Addon("cpu");

cpu.registerCallback("test", async() => {
    return true;
});

setInterval(function interval() {
    if (!cpu.isStarted) {
        return;
    }
    console.log("CPU Interval triggered!");
}, 1000);
module.exports = cpu;
