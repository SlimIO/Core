// Require Node.JS Dependencies
const { mkdir, unlink, writeFile, readFile } = require("fs").promises;
const { join } = require("path");

// Require Third-party dependencies
const test = require("japa");
const rimraf = require("rimraf");

const { searchForAddons, generateDump } = require("../src/utils");

test.group("Utils", (group) => {

    // GROUP CONSTANTS
    const UTILS_DIR = join(__dirname, "utils");

    group.before(async() => {
        await mkdir(UTILS_DIR);
        await mkdir(join(UTILS_DIR, "debug"));
    });

    group.after(async() => {
        function errorHandler(error) {
            if (error) {
                console.error(error);
            }
        }
        rimraf(join(__dirname, "searchForAddons"), errorHandler);
        rimraf(UTILS_DIR, errorHandler);
        await new Promise((resolve) => setTimeout(resolve, 10));
    });

    test("Utils.js searchForAddons (root should be typeof <string>)", async(assert) => {
        try {
            await searchForAddons(5);
        }
        catch (error) {
            assert.strictEqual(error.message, "utils.searchForAddons->root should be typeof <string>");
        }
    });

    test("Utils.js searchForAddons", async(assert) => {
        const seekDir = join(__dirname, "searchForAddons");

        await mkdir(seekDir);
        {
            const ret = await searchForAddons(seekDir);
            assert.deepEqual({}, ret);
        }

        const addonDir = join(seekDir, "addons");
        await mkdir(addonDir);
        await writeFile(join(addonDir, "nothing.txt"), "");
        await mkdir(join(addonDir, "badAddon"));
        await mkdir(join(addonDir, "goodAddon"));
        await writeFile(join(addonDir, "goodAddon", "index.js"), "");

        const ret = await searchForAddons(seekDir);
        assert.deepEqual({ goodAddon: {} }, ret);
    });

    test("Generate empty dump error", async(assert) => {
        const dumpFile = generateDump(UTILS_DIR, {});
        await new Promise((resolve) => setTimeout(resolve, 50));
        const dumpStr = await readFile(dumpFile, "utf-8");
        assert.isString(dumpStr, "dumpStr is string");

        const dump = JSON.parse(dumpStr);
        assert.isString(dump.date, "dump.date is string");
        assert.isNull(dump.code, "dump.code is null");
        assert.isString(dump.message, "dump.message is string");
        assert.isEmpty(dump.message, "dump.message is empty string");
        assert.isString(dump.stack, "dump.stack is string");
        assert.isEmpty(dump.stack, "dump.stack is empty string");

        await unlink(dumpFile);
    });

    test("Generate basic dump error", async(assert) => {
        const dumpFile = generateDump(UTILS_DIR, {
            code: "ABC",
            message: "test",
            stack: "test1\ntest2"
        });
        await new Promise((resolve) => setTimeout(resolve, 50));
        const dumpStr = await readFile(dumpFile, "utf-8");
        assert.isString(dumpStr, "dumpStr is string");

        const dump = JSON.parse(dumpStr);
        assert.isString(dump.date, "dump.date is string");
        assert.strictEqual(dump.code, "ABC", "dump.code === \"ABC\"");
        assert.strictEqual(dump.message, "test", "dump.message === \"test\"");
        assert.deepEqual(dump.stack, ["test1", "test2"], "dump.stack == [\"test1\", \"test2\"]");
        await unlink(dumpFile);
    });

});
