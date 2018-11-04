const Addon = require("@slimio/addon");
const assert = require("assert");

const cpu = new Addon("cpu", "1.0.0");

/**
 * @func sendMessage
 * @param {!String} target message target
 * @returns {Promise<any>}
 */
function sendMessage(target) {
    return new Promise((resolve, reject) => {
        cpu.sendMessage(target).subscribe(resolve, reject);
    });
}

// eslint-disable-next-line
cpu.registerCallback(async function cb_test(header, ok) {
    assert.strictEqual(header.from, "test");
    assert.strictEqual(ok, 1);

    return { ok };
});

cpu.on("start", () => {
    cpu.ready();
});

cpu.on("addonLoaded", async(addonName) => {
    if (!cpu.isReady) {
        await cpu.once("ready", 250);
    }

    scope: if (addonName === "test") {
        try {
            const { ok } = await sendMessage("test.cb_test");
            assert.strictEqual(ok, 1);
        }
        catch (err) {
            // console.log(err);
            console.log("> TEST FAILED!");
            break scope;
        }

        try {
            await sendMessage("test.cb_fail");
        }
        catch (err) {
            assert.strictEqual(err.message, "Opps!");
            console.log("> TEST COMPLETED!");
        }
    }
});

module.exports = cpu;
