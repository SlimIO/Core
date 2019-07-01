const Addon = require("@slimio/addon");

const events = new Addon("events", {
    version: "1.0.0"
});

// eslint-disable-next-line
events.registerCallback(async function publish(header) {
    // ignore
});

events.on("start", () => {
    events.ready();
});

module.exports = events;
