// Require Third-party dependencies
const test = require("ava");
const is = require("@sindresorhus/is");

// Require package
const Core = require("../index");

test("Create Core", function createCore(assert) {
    let error;
    error = assert.throws(() => {
        new Core(5);
    }, TypeError);
    assert.is(error.message, "dirname should be type <string>");

    error = assert.throws(() => {
        new Core("a string");
    }, Error);
    assert.is(error.message, "Core.root->value should be an absolute system path!");

    const core = new Core(__dirname);
    assert.is(core.constructor.name === "Core", true);
    assert.is(is.map(core.routingTable), true);
    assert.is(is.boolean(core.hasBeenInitialized), true);
    assert.is(is.object(core.config), true);
    assert.is(core.hasBeenInitialized, false);
});

test("Initialization of Core", async function initCore(assert) {
    const core = new Core(__dirname);
    await core.initialize();
    assert.is(is.map(core.routingTable), true);
    assert.is(is.boolean(core.hasBeenInitialized), true);
    assert.is(is.object(core.config), true);
    assert.is(core.hasBeenInitialized, true);
});

// test("Create Core with dir without addon", async function createCoreWithoutAddon(assert) {
//     const core = new Core(`${__dirname}/dirWithoutAddon`);
//     await core.initialize();
// });

test("getter addons", async function getterAddons(assert) {
    const core = new Core(__dirname);
    await core.initialize();
    const addons = core.addons;
    assert.is(is.array(addons), true);
    for (const addon of addons) {
        assert.is(is.object(addon), true);
        assert.is(addon.constructor.name === "Addon", true);
    }
});

test("Exit core", async function exitCore(assert) {
    const core = new Core(__dirname);

    const error = await assert.throws(core.exit(), Error);
    assert.is(error.message, "Core.exit - Cannot close unitialized core");

    await core.initialize();
    await core.exit();
});
