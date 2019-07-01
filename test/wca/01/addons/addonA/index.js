const Addon = require("@slimio/addon");
const assert = require("assert");

const addonA = new Addon("addonA", {
    version: "1.0.0"
})
    .lockOn("events")
    .lockOn("addonB");

// eslint-disable-next-line
addonA.registerCallback(async function cb_test(header, ok) {
    assert.strictEqual(header.from, "addonB");
    assert.strictEqual(ok, 1);

    return { ok };
});

addonA.on("awake", async() => {
    addonA.ready();
    scope: {
        try {
            const { ok } = await addonA.sendOne("addonB.cb_test");
            assert.strictEqual(ok, 1);
        }
        catch (err) {
            console.log(err);
            console.log("> TEST FAILED!");
            break scope;
        }

        try {
            const ret = await addonA.sendOne("addonB.cb_void");
            assert.strictEqual(ret, void 0);
        }
        catch (err) {
            console.log(err);
            console.log("> TEST FAILED!");
            break scope;
        }

        try {
            await addonA.sendOne("addonB.cb_fail");
        }
        catch (err) {
            assert.strictEqual(err.message, "Opps!");
            console.log("> TEST COMPLETED!");
        }
    }
});

module.exports = addonA;
