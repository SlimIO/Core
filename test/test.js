// Require Node.JS Dependencies
const {
    rmdir,
    promises: {
        unlink,
        writeFile,
        readFile,
        readdir,
        access,
        lstat
    },
    constants: { R_OK, X_OK }
} = require("fs");
const { join } = require("path");

// Require Third-party dependencies
const test = require("japa");
const is = require("@sindresorhus/is");

// Require package
const Core = require("../index");

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

test.group("Default test", (group) => {
    group.after(async() => {
        console.log("ReMOVE FILE AGENT GROUP");
        const remove = [
            "test/agent.json",
            "test/debug",
            "test/dirWithoutAddon/agent.json",
            "test/dirWithoutAddon/debug"
        ];

        for (const elem of remove) {
            try {
                await access(elem, R_OK | X_OK);
            }
            catch (err) {
                if (err.code === "ENOENT") {
                    continue;
                }
            }
            const stats = await lstat(elem);

            if (stats.isFile()) {
                await unlink(elem);
            }
            if (stats.isDirectory()) {
                await rmdir(elem, (err) => {
                    console.log(err);
                });
            }
        }
    });

    test("Create Core", (assert) => {
        assert.plan(8);
        try { new Core(5); }
        catch (error) {
            assert.strictEqual(error.message, "dirname should be type <string>");
        }

        try { new Core(__dirname, 5); }
        catch (error) {
            assert.strictEqual(error.message, "options should be type <object>");
        }

        try { new Core("a string"); }
        catch (error) {
            assert.strictEqual(error.message, "Core.root->value should be an absolute system path!");
        }

        const core = new Core(__dirname);
        assert.strictEqual(core.constructor.name, "Core", "core.constructor.name === \"Core\"");
        assert.strictEqual(is.map(core.routingTable), true, "core.routingTable is a Map");
        assert.isBoolean(core.hasBeenInitialized, "core.hasBeenInitialized is boolean");
        assert.isObject(core.config, "core.config is object");
        assert.strictEqual(core.hasBeenInitialized, false, "core.hasBeenInitialized === false");
    });

    test("Create Core with autoReload", (assert) => {
        assert.plan(6);
        const core = new Core(__dirname, { autoReload: true });
        assert.strictEqual(core.constructor.name, "Core", "core.constructor.name === \"Core\"");
        assert.strictEqual(is.map(core.routingTable), true, "core.routingTable is a Map");
        assert.isBoolean(core.hasBeenInitialized, "core.hasBeenInitialized is boolean");
        assert.isObject(core.config, "core.config is object");
        assert.strictEqual(core.hasBeenInitialized, false, "core.hasBeenInitialized === false");
        assert.strictEqual(core.config.reloadDelay, 500, "core.config.reloadDelay === 500");
    });

    test("Initialization of Core", async(assert) => {
        assert.plan(4);
        const core = new Core(__dirname);
        await core.initialize();
        await new Promise((resolve) => {
            core.config.once("configWritten", () => {
                assert.strictEqual(is.map(core.routingTable), true, "core.routingTable is Map");
                assert.isBoolean(core.hasBeenInitialized, "core.hasBeenInitialized is boolean");
                assert.strictEqual(core.hasBeenInitialized, true, "core.hasBeenInitialized === true");
                assert.isObject(core.config, "core.config is object");
                resolve();
            });
        });
    });

    test("Create Core without addon", async(assert) => {
        assert.plan(2);
        const core = new Core(`${__dirname}/dirWithoutAddon`);
        await core.initialize();
        const addons = core.addons;
        assert.isArray(addons, "addons is array");
        assert.strictEqual(addons.length, 0, "addon.length === 0");
    });

    test("Getter addons", async(assert) => {
        assert.plan(5);
        const core = new Core(__dirname);
        await core.initialize();
        const addons = core.addons;
        assert.isArray(addons, "addons is array");
        for (const addon of addons) {
            assert.isObject(addon, "addon is object");
            assert.strictEqual(addon.constructor.name, "Addon", "addon.constructor.name === \"Addon\"");
        }
    });

    test("Exit core", async(assert) => {
        assert.plan(1);
        const core = new Core(__dirname);
        try { await core.exit(); }
        catch (error) {
            assert.strictEqual(error.message, "Core.exit - Cannot close unitialized core");
        }

        await core.initialize();
        await core.exit();
    });
});

test.group("Other Config file", (group) => {

    group.afterEach(async() => {
        await unlink(join(__dirname, "agent.json"));
    });

    test("FakeAddon", async(assert) => {
        const fakeAddonFile = "function test() { return 5 }\nmodule.exports = test;\n"
        const fakeAddonPath = join(__dirname, "addons/fakeAddon");
        await writeFile(join(fakeAddonPath, "index.js"), fakeAddonFile);

        const core = new Core(__dirname);
        await core.initialize();

        await unlink(join(fakeAddonPath, "index.js"));
        const debugDir = join(__dirname, "debug");
        let files = await readdir(debugDir);
        assert.lengthOf(files, 1, "Must be one file in debug directory");
        for (const file of files) {
            await unlink(join(debugDir, file));
        }
        files = await readdir(debugDir);
        assert.lengthOf(files, 0, "debug directory must be clear");
        await core.exit();
    });

    test("Desactivate an addon", async(assert) => {
        const core = new Core(__dirname);
        await core.initialize();
        core.config.once("configWrited", async() => {
            console.log("CONFIG WRITTEN");
            assert.isTrue(core.config.get("addons.ondemand.active"), "addons.ondemand.active === TRUE");
            core.config.set("addons.ondemand.active", false);
            // await core.config.writeOnDisk();
            assert.isFalse(core.config.get("addons.ondemand.active"), "addons.ondemand.active === FALSE");
            const addons = core._addons;
            await new Promise((resolve) => {
                addons.get("ondemand").on("stop", () => {
                    resolve();
                });
            });
        });

        // console.log(agentJson);
        // await writeFile(join(__dirname, "agent.json"), JSON.stringify(agentJson, null, 4));
        // await core.exit();
    });
});
