const Addon = require("@slimio/addon");
const assert = require("assert");

const addonB = new Addon("addonB", {
    version: "1.0.0"
}).lockOn("events");

// eslint-disable-next-line
addonB.registerCallback(async function cb_test(header) {
    assert.strictEqual(header.from, "addonA");
    const ret = await addonB.sendOne(`${header.from}.cb_test`, [1]);

    return ret;
});

// eslint-disable-next-line
addonB.registerCallback(async function cb_void(header) {
    assert.strictEqual(header.from, "addonA");

    return void 0;
});

// eslint-disable-next-line
addonB.registerCallback(async function cb_fail(header) {
    assert.strictEqual(header.from, "addonA");
    throw new Error("Opps!");
});

addonB.on("start", () => {
    addonB.ready();
});

module.exports = addonB;
