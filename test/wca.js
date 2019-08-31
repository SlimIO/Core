// Require Node.js Dependencies
import { join, dirname } from "path";
import { promises as fs } from "fs";
import { spawn } from "child_process";
import { fileURLToPath } from 'url';
const { writeFile, unlink } = fs;

// Require Third-party dependencies
import test from "japa";

// Recreate __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// GROUP CONSTANTS
const WCA_DIR = join(__dirname, "wca");

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
        const str = buf.toString().trim();
        if (str === "") {
            continue;
        }
        console.log(str);

        if (str.includes("TEST COMPLETED!")) {
            break;
        }
        else if (str.includes("TEST PASS")) {
            test.ok(true, true);
        }
        else if (str.includes("TEST FAILED")) {
            test.fail();
            break;
        }
    }
}

test.group("WCA", (group) => {
    group.after(async() => {
        try {
            await Promise.all([
                unlink(join(WCA_DIR, "01", "agent.json")),
                unlink(join(WCA_DIR, "02", "agent.json"))
            ]);
        }
        catch (err) {
            // Do nothing
        }
    });

    test("Case 01 (Standalone false)", async(test) => {
        const config = {
            addons: {
                events: { active: true, standalone: false },
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
                events: { active: true, standalone: false },
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
                events: { active: true, standalone: false },
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
                events: { active: true, standalone: false },
                addonA: { active: true, standalone: true },
                addonB: { active: true, standalone: true }
            }
        };

        await writeFile(join(WCA_DIR, "01", "agent.json"), JSON.stringify(config));
        await runCase(test, "01");
    });

    // test("Case 02 (Standalone false)", async(test) => {
    //     test.plan(2);
    //     const config = {
    //         addons: {
    //             events: { active: true, standalone: false },
    //             addonA: { active: true, standalone: false },
    //             addonB: { active: true, standalone: false }
    //         }
    //     };

    //     await writeFile(join(WCA_DIR, "02", "agent.json"), JSON.stringify(config));
    //     await runCase(test, "02");
    // });

    // test("Case 02 (Standalone true)", async(test) => {
    //     test.plan(2);
    //     const config = {
    //         addons: {
    //             events: { active: true, standalone: false },
    //             addonA: { active: true, standalone: true },
    //             addonB: { active: true, standalone: true }
    //         }
    //     };

    //     await writeFile(join(WCA_DIR, "02", "agent.json"), JSON.stringify(config));
    //     await runCase(test, "02");
    // });

    // test("Case 02 (Standalone mix left)", async(test) => {
    //     test.plan(2);
    //     const config = {
    //         addons: {
    //             events: { active: true, standalone: false },
    //             addonA: { active: true, standalone: true },
    //             addonB: { active: true, standalone: false }
    //         }
    //     };

    //     await writeFile(join(WCA_DIR, "02", "agent.json"), JSON.stringify(config));
    //     await runCase(test, "02");
    // });

    // test("Case 02 (Standalone mix right)", async(test) => {
    //     test.plan(3);
    //     const config = {
    //         addons: {
    //             events: { active: true, standalone: false },
    //             addonA: { active: true, standalone: false },
    //             addonB: { active: true, standalone: true }
    //         }
    //     };

    //     await writeFile(join(WCA_DIR, "02", "agent.json"), JSON.stringify(config));
    //     await runCase(test, "02");
    // });
});
