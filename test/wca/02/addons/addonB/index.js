const Addon = require("@slimio/addon");

const addonB = new Addon("addonB", "1.0.0");

addonB.on("start", () => {
    addonB.ready();
});

addonB.on("addonLoaded", async(addonName) => {
    if (!addonB.isReady) {
        await addonB.once("ready", 250);
    }

    if (addonName === "addonA") {
        addonB.sendMessage("addonA.cb_test").subscribe(
            () => console.log("> TEST PASS!"),
            () => console.log("> TEST FAILED!"),
            () => {
                console.log("> TEST COMPLETED!");
                setImmediate(() => {
                    process.exit(0);
                });
            }
        );
    }
});

module.exports = addonB;
