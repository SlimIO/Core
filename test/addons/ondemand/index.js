// Require Internal Dependencies
const Addon = require("@slimio/addon");
const Scheduler = require("@slimio/scheduler");

// Declare Addon
const ondemand = new Addon("ondemand");

async function interval() {
    console.time("get_cpu");
    ondemand.sendMessage("cpu.get_info").subscribe((info) => {
        console.timeEnd("get_cpu");
        console.log(info);
    });

    return "hello world!";
}
ondemand.registerCallback(interval).schedule(new Scheduler({ interval: 1 }));

ondemand.once("init", () => {
    console.log("addon ondemand initialized");
});

module.exports = ondemand;
