// Require NodeJS Dependencies
const { mkdir, writeFile } = require("fs").promises;
const { join } = require("path");

// Require Third-party dependencies
const test = require("japa");
const rimraf = require("rimraf");

// Require Internal Dependencies
const Core = require("../index");

test.group("Communication Tests", (group) => {
    // Group CONSTANTS
    const communicationDir = join(__dirname, "communication");

    // Setup Group
    group.before(async() => {
        await mkdir(communicationDir);
        const config = Object.assign(Core.DEFAULTConfiguration, {
            addons: {}
        });
        await writeFile(join(communicationDir, "agent.json"), JSON.stringify(config));
    });

    // Cleanup Group
    group.after(async() => {
        rimraf(communicationDir, (error) => {
            if (error) {
                console.error(error);
            }
        });
        await new Promise((resolve) => setTimeout(resolve, 10));
    });

    test("Communication Between two addons", async() => {
        const _core = new Core(communicationDir);

        // Overwrite Core Config behavior for our test!
        _core.config.autoReload = false;
        _core.config.writeOnSet = false;
        _core.config.createOnNoEntry = false;

        // Initialize Core
        await _core.initialize();

        // Exit properly
        await _core.exit();
    });

});
