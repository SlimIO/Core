// Require Internal Dependencies
const Addon = require("@slimio/addon");
const Scheduler = require("@slimio/scheduler");

// Declare Addon
const ondemand = new Addon("ondemand");

// eslint-disable-next-line
async function interval() {
    ondemand.sendMessage("cpu.test").subscribe((info) => {
        console.log(info);
    });

    return "hello world!";
}
ondemand
    .registerCallback(interval)
    .schedule(new Scheduler({ interval: 1 }));

module.exports = ondemand;
