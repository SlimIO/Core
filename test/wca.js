// Require Node.JS Dependencies
const { join } = require("path");
const { writeFile, unlink } = require("fs").promises;
const { spawn } = require("child_process");

// Require Third-party dependencies
const test = require("japa");

// GROUP CONSTANTS
const WCA_DIR = join(__dirname, "wca");
const COMPLETED = Buffer.from("> TEST COMPLETED!\n");
const PASSED = Buffer.from("> TEST PASS!\n");
const FAILED = Buffer.from("> TEST FAILED!\n");

/**
 * @async
 * @func runCase
 * @param {!Assert} test test Assertion
 * @param {!String} id Workcase ID
 * @returns {Promise<void>}
 */
async function runCase(test, id) {
    const proc = spawn(process.argv[0], [
        "--no-warnings",
        join(WCA_DIR, "agent_runner.js"),
        join(WCA_DIR, id)
    ]);
    proc.stderr.on("data", (buf) => console.error(buf.toString()));

    for await (const buf of proc.stdout) {
        // console.log(buf.toString());
        if (COMPLETED.equals(buf)) {
            break;
        }
        else if (PASSED.equals(buf)) {
            test.ok(true, true);
        }
        else if (FAILED.equals(buf)) {
            test.fail();
            break;
        }
    }

    proc.kill();
}

test.group("WCA", (group) => {

    group.after(async() => {
        await Promise.all([
            unlink(join(WCA_DIR, "01", "agent.json")),
            unlink(join(WCA_DIR, "02", "agent.json"))
        ]);
    });

    test("Case 01 (Standalone false)", async(test) => {
        const config = {
            addons: {
                addonA: { active: true, standalone: false },
                addonB: { active: true, standalone: false }
            }
        };

        await writeFile(join(WCA_DIR, "01", "agent.json"), JSON.stringify(config));
        await runCase(test, "01");
    });

    test("Case 01 (Standalone mix left)", async(test) => {
        const config = {
            addons: {
                addonA: { active: true, standalone: true },
                addonB: { active: true, standalone: false }
            }
        };

        await writeFile(join(WCA_DIR, "01", "agent.json"), JSON.stringify(config));
        await runCase(test, "01");
    });

    test("Case 01 (Standalone mix right)", async(test) => {
        const config = {
            addons: {
                addonA: { active: true, standalone: false },
                addonB: { active: true, standalone: true }
            }
        };

        await writeFile(join(WCA_DIR, "01", "agent.json"), JSON.stringify(config));
        await runCase(test, "01");
    });

    test("Case 01 (Standalone true)", async(test) => {
        const config = {
            addons: {
                addonA: { active: true, standalone: true },
                addonB: { active: true, standalone: true }
            }
        };

        await writeFile(join(WCA_DIR, "01", "agent.json"), JSON.stringify(config));
        await runCase(test, "01");
    });

    test("Case 02 (Standalone false)", async(test) => {
        test.plan(2);
        const config = {
            addons: {
                addonA: { active: true, standalone: false },
                addonB: { active: true, standalone: false }
            }
        };

        await writeFile(join(WCA_DIR, "02", "agent.json"), JSON.stringify(config));
        await runCase(test, "02");
    });

    test("Case 02 (Standalone true)", async(test) => {
        test.plan(2);
        const config = {
            addons: {
                addonA: { active: true, standalone: true },
                addonB: { active: true, standalone: true }
            }
        };

        await writeFile(join(WCA_DIR, "02", "agent.json"), JSON.stringify(config));
        await runCase(test, "02");
    });

    test("Case 02 (Standalone mix left)", async(test) => {
        test.plan(2);
        const config = {
            addons: {
                addonA: { active: true, standalone: true },
                addonB: { active: true, standalone: false }
            }
        };

        await writeFile(join(WCA_DIR, "02", "agent.json"), JSON.stringify(config));
        await runCase(test, "02");
    });

    test("Case 02 (Standalone mix right)", async(test) => {
        test.plan(2);
        const config = {
            addons: {
                addonA: { active: true, standalone: false },
                addonB: { active: true, standalone: true }
            }
        };

        await writeFile(join(WCA_DIR, "02", "agent.json"), JSON.stringify(config));
        await runCase(test, "02");
    });

});
