const Addon = require("@slimio/addon");

const addonA = new Addon("addonA", {
    version: "1.0.0"
});

// eslint-disable-next-line
addonA.registerCallback(async function cb_test(header) {
    const wS = new Addon.Stream();
    setTimeout(() => {
        wS.write("hello");
    }, 100);
    setTimeout(() => {
        wS.write("world!");
        wS.end();
    }, 200);

    return wS;
});

addonA.on("start", () => {
    addonA.ready();
});

module.exports = addonA;
