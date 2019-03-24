const Addon = require("@slimio/addon");

const addonB = new Addon("addonB", {
    version: "1.0.0"
}).lockOn("addonA");

addonB.on("start", () => {
    addonB.ready();
});

addonB.on("awake", async() => {
    addonB.sendMessage("addonA.cb_test").subscribe(
        () => console.log("> TEST PASS!"),
        () => console.log("> TEST FAILED!"),
        () => console.log("> TEST COMPLETED!")
    );
});

module.exports = addonB;
