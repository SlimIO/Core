// Require Node.JS Dependencies
const { join } = require("path");
const { spawn } = require("child_process");

// Require Third-party dependencies
const test = require("japa");

test.group("WCA", () => {

    // GROUP CONSTANTS
    const WCA_DIR = join(__dirname, "wca");
    const bCompleted = Buffer.from("> TEST COMPLETED!\n");

    test("Case 01", async() => {
        const proc = spawn(process.argv[0], [
            join(WCA_DIR, "agent_runner.js"),
            join(WCA_DIR, "01")
        ]);

        for await (const buf of proc.stdout) {
            if (bCompleted.equals(buf)) {
                console.log("Case 01 completed!");
                break;
            }
        }
    });

});
