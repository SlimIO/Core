const Addon = require("@slimio/addon");

const test = new Addon("test", "1.0.0");

test.registerCallback(async function cb_test(header) {
    console.log(header);

    return "hello world!";
});

test.on("start", () => {
    test.ready();
});

module.exports = test;
