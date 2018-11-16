const Addon = require("@slimio/addon");
const assert = require("assert");

const addonA = new Addon("addonA", "1.0.0");

/**
 * @func sendMessage
 * @param {!String} target message target
 * @returns {Promise<any>}
 */
function sendMessage(target) {
    return new Promise((resolve, reject) => {
        addonA.sendMessage(target).subscribe(resolve, reject);
    });
}

// eslint-disable-next-line
addonA.registerCallback(async function cb_test(header, ok) {
    assert.strictEqual(header.from, "addonB");
    assert.strictEqual(ok, 1);

    return { ok };
});

addonA.on("start", () => {
    addonA.ready();
});

addonA.on("addonLoaded", async(addonName) => {
    if (!addonA.isReady) {
        await addonA.once("ready", 250);
    }

    scope: if (addonName === "addonB") {
        try {
            const { ok } = await sendMessage("addonB.cb_test");
            assert.strictEqual(ok, 1);
        }
        catch (err) {
            console.log(err);
            console.log("> TEST FAILED!");
            break scope;
        }

        try {
            const ret = await sendMessage("addonB.cb_void");
            assert.strictEqual(ret, void 0);
        }
        catch (err) {
            console.log(err);
            console.log("> TEST FAILED!");
            break scope;
        }

        try {
            await sendMessage("addonB.cb_fail");
        }
        catch (err) {
            assert.strictEqual(err.message, "Opps!");
            console.log("> TEST COMPLETED!");
            setImmediate(() => {
                process.exit(0);
            });
        }
    }
});

module.exports = addonA;
