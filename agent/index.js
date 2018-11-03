const {
    performance,
    PerformanceObserver
} = require("perf_hooks");
const mod = require("module");

// Monkey patch the require function
mod.Module.prototype.require =
    performance.timerify(mod.Module.prototype.require);
require = performance.timerify(require);

// Activate the observer
const obs = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    entries.forEach((entry) => {
        if (entry.duration > 1) {
            console.log(`require('${entry[0]}')`, entry.duration, "ms");
        }
    });
    obs.disconnect();
});
obs.observe({ entryTypes: ["function"], buffered: true });

const Core = require("../");

async function main() {
    console.time("start_core");
    const core = await (new Core(__dirname)).initialize();
    console.timeEnd("start_core");

    // Handle exit signal!
    process.on("SIGINT", () => {
        console.error("Exiting SlimIO Agent (please wait)");
        core.exit().then(() => {
            setImmediate(process.exit);
        }).catch(function mainErrorHandler(error) {
            console.error(error);
            process.exit(1);
        });
    });
}
main().catch(console.error);
