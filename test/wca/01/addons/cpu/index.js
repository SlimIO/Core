const Addon = require("@slimio/addon");

const cpu = new Addon("cpu", "1.0.0");

cpu.on("start", () => {
    cpu.ready();
});

cpu.on("addonLoaded", (addonName) => {
    if (addonName === "test") {
        cpu.sendMessage("test.cb_test").subscribe((ret) => {
            if (ret.ok === 1) {
                console.log("> TEST COMPLETED!");
            }
        });
    }
});

module.exports = cpu;
