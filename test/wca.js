// Require Node.JS Dependencies
const { join } = require("path");
const { spawn } = require("child_process");

// Require Third-party dependencies
const test = require("japa");

test.group("WCA", () => {

    // GROUP CONSTANTS
    const WCA_DIR = join(__dirname, "wca");
    const bCompleted = Buffer.from("> TEST COMPLETED!\n");
    const bFailed = Buffer.from("> TEST FAILED!\n");

    test("Case 01", async(test) => {
        const proc = spawn(process.argv[0], [
            join(WCA_DIR, "agent_runner.js"),
            join(WCA_DIR, "01")
        ]);
        proc.stderr.on("data", (buf) => {
            console.error(buf.toString());
        });

        for await (const buf of proc.stdout) {
            console.log(buf.toString());
            if (bCompleted.equals(buf)) {
                console.log("Case 01 completed!");
                break;
            }
            else if (bFailed.equals(buf)) {
                test.fail();
                break;
            }
        }
        proc.kill();
    });

});
