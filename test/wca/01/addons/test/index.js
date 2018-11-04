const Addon = require("@slimio/addon");
const assert = require("assert");

const test = new Addon("test", "1.0.0");

// eslint-disable-next-line
test.registerCallback(async function cb_test(header) {
    assert.strictEqual(header.from, "cpu");
    const ret = await new Promise((resolve, reject) => {
        test.sendMessage(`${header.from}.cb_test`, { args: [1] })
            .subscribe(resolve, reject);
    });

    return ret;
});

// eslint-disable-next-line
test.registerCallback(async function cb_fail(header) {
    assert.strictEqual(header.from, "cpu");
    throw new Error("Opps!");
});

test.on("start", () => {
    test.ready();
});

module.exports = test;
