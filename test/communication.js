// Require NodeJS Dependencies
const { mkdir, writeFile } = require("fs").promises;
const { join } = require("path");

// Require Third-party dependencies
const test = require("japa");
const rimraf = require("rimraf");
const { createDirectory } = require("@slimio/utils");
const {
    AddonFactory,
    CallbackFactory,
    Components: { Message }
} = require("@slimio/addon-factory");

// Require Internal Dependencies
const Core = require("../index");

// Group CONSTANTS
const communicationDir = join(__dirname, "communication");

test.group("Communication Tests", (group) => {

    // Setup Group
    group.before(async() => {
        await createDirectory(communicationDir);
        await writeFile(join(communicationDir, "agent.json"), JSON.stringify(Core.DEFAULT_CONFIGURATION));
    });

    // Cleanup Group
    group.after(async() => {
        rimraf(communicationDir, (error) => {
            if (error) {
                console.error(error);
            }
        });
        await new Promise((resolve) => setTimeout(resolve, 50));
    });

    test("Communication Between two addons", async() => {
        // Create Addons Mock
        {
            const cbA1 = new CallbackFactory("callme")
                .add(new Message("Addon2.callMe"))
                .return({ error: null });

            const cbA2 = new CallbackFactory("callme")
                .return(true);

            const A1 = new AddonFactory("Addon1")
                .addCallback(cbA1);
            const A2 = new AddonFactory("Addon2")
                .addCallback(cbA2);

            const addonsDir = join(communicationDir, "addons");
            await mkdir(addonsDir);
            await Promise.all([
                A1.generate(addonsDir),
                A2.generate(addonsDir)
            ]);
        }

        // Create Core
        const _core = new Core(communicationDir);

        // Overwrite Core Config behavior for our test!
        _core.config.autoReload = false;
        _core.config.writeOnSet = false;
        _core.config.createOnNoEntry = false;

        // Initialize Core
        await _core.initialize();

        const Addon = _core.addons.get("Addon1");
        await Addon.executeCallback("callme");

        // Exit properly
        await _core.exit();
    });

});
