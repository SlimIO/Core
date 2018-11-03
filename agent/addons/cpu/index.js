const Addon = require("@slimio/addon");

const cpu = new Addon("cpu", "1.0.0");

cpu.on("start", () => {
    cpu.sendMessage("test.cb_test").subscribe(
        console.log,
        console.error
    );
    cpu.ready();
});

// cpu.on("addonLoaded", (addonName) => {
//     console.log(addonName);
//     if (addonName === "test") {
//         cpu.sendMessage("test.cb_test").subscribe(console.log);
//     }
// });

module.exports = cpu;
