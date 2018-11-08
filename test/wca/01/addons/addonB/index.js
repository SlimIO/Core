const Addon = require("@slimio/addon");
const assert = require("assert");

const addonB = new Addon("addonB", "1.0.0");

// eslint-disable-next-line
addonB.registerCallback(async function cb_test(header) {
    assert.strictEqual(header.from, "addonA");
    const ret = await new Promise((resolve, reject) => {
        addonB.sendMessage(`${header.from}.cb_test`, { args: [1] })
            .subscribe(resolve, reject);
    });

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
