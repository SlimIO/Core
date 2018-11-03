const Addon = require("@slimio/addon");

const test = new Addon("test", "1.0.0");

// eslint-disable-next-line
test.registerCallback(async function cb_test(header) {
    return { ok: 1 };
});

test.on("start", () => {
    test.ready();
});

module.exports = test;
