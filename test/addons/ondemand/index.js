// Require Internal Dependencies
const Addon = require("@slimio/addon");
const Scheduler = require("@slimio/scheduler");

// Declare Addon
const ondemand = new Addon("ondemand");

async function interval() {
    ondemand.sendMessage("cpu.get_info").subscribe((info) => {
        console.log("receiving response from cpu!");
        console.log(info);
    });

    return "hello world!";
}
ondemand.registerCallback(interval).schedule(new Scheduler({ interval: 1 }));

ondemand.once("init", () => {
    console.log("addon ondemand initialized");
});

module.exports = ondemand;
