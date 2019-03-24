// Require Node.JS Dependencies
const {
    promises: {
        mkdir, unlink, writeFile, readdir, access
    },
    constants: { R_OK, X_OK }
} = require("fs");
const { join } = require("path");

// Require Third-party dependencies
const test = require("japa");
const is = require("@slimio/is");
const rimraf = require("rimraf");
const { AddonFactory } = require("@slimio/addon-factory");

// Require Internal Dependencies
const Core = require("../index");

// eslint-disable-next-line
test.group("Default core properties, methods and behavior", (group) => {
    group.before(async() => {
        const addonDir = join(__dirname, "addons");
        await Promise.all([
            mkdir(addonDir),
            mkdir(join(__dirname, "debug")),
            mkdir(join(__dirname, "dirWithoutAddon"))
        ]);
        await mkdir(join(addonDir, "fakeAddon"));
        await (new AddonFactory("cpu")).generate(addonDir);
        await (new AddonFactory("ondemand")).generate(addonDir);
    });

    group.after(async() => {
        await unlink(join(__dirname, "agent.json"));
        rimraf(join(__dirname, "debug"), (error) => {
            if (error) {
                console.error(error);
            }
        });
        await new Promise((resolve) => setTimeout(resolve, 10));
    });

    test("Core dirname should be typeof string!", (assert) => {
        try {
            new Core(5);
        }
        catch (error) {
            assert.strictEqual(error.message, "dirname should be typeof string!");
        }
    });

    test("Core options should be a plain object!", (assert) => {
        try {
            new Core(__dirname, []);
        }
        catch (error) {
            assert.strictEqual(error.message, "options should be a plain object!");
        }
    });

    test("Create Core and tests default properties types and values", (assert) => {
        const core = new Core(__dirname, { silent: true });

        assert.strictEqual(is.map(core.routingTable), true, "core.routingTable is a Map");
        assert.strictEqual(is.map(core.addons), true, "core.addons is a Map");
        assert.strictEqual(core.addons.size, 0, "core.addons size is equal to 0");
        assert.isBoolean(core.hasBeenInitialized, "core.hasBeenInitialized is boolean");
        assert.isBoolean(core.silent, "core.hasBeenInitialized is boolean");
        assert.strictEqual(core.silent, true, "core.silent should be equal to true");
        assert.strictEqual(core.hasBeenInitialized, false, "core.hasBeenInitialized === false");
        assert.strictEqual(core.config.constructor.name, "Config", "core.config constructor name is equal to Config");
        assert.isString(core.root, "core.root should be a string");
        assert.strictEqual(core.root, __dirname, "core.root should be equal to __dirname");
    });

    test("Create Core with autoReload and test inner Config", (assert) => {
        const coreA = new Core(__dirname, { autoReload: true });
        assert.strictEqual(coreA.config.autoReload, true, "core.config.autoReload should be true!");
        assert.strictEqual(coreA.config.reloadDelay, 500, "core.config.reloadDelay === 500");

        const coreB = new Core(__dirname, { autoReload: false });
        assert.strictEqual(coreB.config.autoReload, false, "core.config.autoReload should be false!");
    });

    test("Initialization of Core", async(assert) => {
        const core = new Core(__dirname, { silent: true });
        try {
            await access(join(__dirname, "agent.json"), R_OK | X_OK);
        }
        catch (error) {
            assert.strictEqual(error.code, "ENOENT", "No entry for agent.json");
        }

        assert.strictEqual(core.hasBeenInitialized, false, "core.hasBeenInitialized === false");
        await core.initialize();
        await access(join(__dirname, "agent.json"), R_OK | X_OK);
        assert.strictEqual(core.hasBeenInitialized, true, "core.hasBeenInitialized === true");
        assert.strictEqual(core.addons.size, 2, "core.addons.size should be equal to 2");

        await core.exit();
    });

    test("Create Core without addon", async(assert) => {
        const core = new Core(join(__dirname, "dirWithoutAddon"));
        await core.initialize();
        await new Promise((resolve) => setImmediate(resolve));

        const addons = [...core.addons.values()];
        assert.isArray(addons, "addons is array");
        assert.strictEqual(addons.length, 0, "addon.length === 0");
    });

    test("Create Core with two addons", async(assert) => {
        const core = new Core(__dirname, { silent: true });
        await core.initialize();
        await new Promise((resolve) => setImmediate(resolve));

        for (const addon of core.addons.values()) {
            assert.isObject(addon, "addon is object");
            assert.strictEqual(addon.constructor.name, "Addon", "addon.constructor.name === \"Addon\"");
        }
    });

    test("Core cannot be exited if not initialized", async(assert) => {
        const core = new Core(__dirname, { silent: true });
        try {
            await core.exit();
        }
        catch (error) {
            assert.strictEqual(error.message, "Core.exit - Cannot close unitialized core");
        }
    });

    test("Exit core", async(assert) => {
        const core = new Core(__dirname, { silent: true });
        await core.initialize();
        await new Promise((resolve) => setTimeout(resolve, 500));

        assert.strictEqual(core.hasBeenInitialized, true, "Core initialized state is true");
        for (const addon of core.addons.values()) {
            assert.strictEqual(addon.isStarted, true, "Addon is started equal true");
        }

        await core.exit();
        assert.strictEqual(core.hasBeenInitialized, false, "Core initialized state is false");
        for (const addon of core.addons.values()) {
            assert.strictEqual(addon.isStarted, false, "Addon is started equal false");
        }
    });
});

test.group("Addons Loading", (group) => {
    group.afterEach(async() => {
        await unlink(join(__dirname, "agent.json"));
    });

    group.after(async() => {
        function errorHandler(error) {
            if (error) {
                console.error(error);
            }
        }
        rimraf(join(__dirname, "addons"), errorHandler);
        rimraf(join(__dirname, "debug"), errorHandler);
        rimraf(join(__dirname, "dirWithoutAddon"), errorHandler);
        await new Promise((resolve) => setTimeout(resolve, 10));
    });

    test("Fake Addon export should generate a Dump file", async(assert) => {
        const fakeAddonFile = "function test() { return 5 }\nmodule.exports = test;\n";
        const fakeAddonPath = join(__dirname, "addons/fakeAddon");
        await writeFile(join(fakeAddonPath, "index.js"), fakeAddonFile);

        const core = new Core(__dirname, { silent: true });
        await core.initialize();
        await new Promise((resolve) => setImmediate(resolve));

        await unlink(join(fakeAddonPath, "index.js"));
        const debugDir = join(__dirname, "debug");
        await new Promise((resolve) => setTimeout(resolve, 50));

        let files = await readdir(debugDir);
        assert.lengthOf(files, 1, "Must be one file in debug directory");
        for (const file of files) {
            await unlink(join(debugDir, file));
        }
        files = await readdir(debugDir);
        assert.lengthOf(files, 0, "debug directory must be clear");
        await core.exit();
    });

    test("Stop an Active Addon", async(assert) => {
        const core = new Core(__dirname, { silent: true });
        await core.initialize();
        await new Promise((resolve, reject) => {
            core.config.once("error", reject);
            core.config.once("configWritten", resolve);
        });
        const onDemandAddon = core.addons.get("ondemand");
        assert.strictEqual(onDemandAddon.isStarted, true, "ondemand Addon is started!");

        assert.isTrue(core.config.get("addons.ondemand.active"), "addons.ondemand.active === TRUE");
        core.config.set("addons.ondemand.active", false);

        await new Promise((resolve, reject) => {
            setTimeout(reject, 1000);
            onDemandAddon.on("stop", resolve);
        });
        await core.exit();
    });

    test("Addon desactivate by default in the configuration", async(assert) => {
        const configObj = {
            addons: {
                cpu: {
                    active: false,
                    standalone: false
                }
            }
        };
        await writeFile(join(__dirname, "agent.json"), JSON.stringify(configObj, null, 4));

        const core = new Core(__dirname, { silent: true });
        await core.initialize(Core.DEFAULT_CONFIGURATION);
        assert.isFalse(core.config.payload.addons.cpu.active);
        core.config.set("addons.cpu.active", true);

        await new Promise((resolve, reject) => {
            core.config.once("error", reject);
            core.config.once("configWritten", resolve);
        });
        assert.isTrue(core.config.payload.addons.cpu.active);

        await core.exit();
    });
});
