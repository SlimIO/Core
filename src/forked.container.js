require("make-promises-safe");
const IPC = require("@slimio/ipc");

// Get the forked addon !
const [addonPath] = process.argv.slice(2);

/**
 * @type {Addon}
 * @todo Replace require by lazy import when possible!
 */
const addon = require(addonPath);
if (addon.constructor.name !== "Addon") {
    throw new TypeError("fork.wrapper addon entry file should be a SlimIO Addon");
}

// Catch EventEmitter errors
addon.catch((error) => {
    console.log(`[${addon.name.toUpperCase()}] error occured!`);
    console.log(error);
});

// Catch SIGINT Signal
process.on("SIGINT", (signal) => {
    console.log(`[${addon.name.toUpperCase()}] Process receiving signal => ${signal}`);
});

const slave = new IPC();

slave.on("message", async(payload, next) => {
    const { header, data: { callback, args = [] } } = payload;

    try {
        const body = await addon.executeCallback(callback, header, ...args);

        // TODO: Implement stream!
        return next({ header, data: { body } });
    }
    catch (error) {
        return next({ header, data: { error: error.message } });
    }
});

slave.on("response", (payload, next) => {
    const { body, error = null, completed = true } = payload.data;
    // Return if there is no message
    if (!addon.observers.has(payload.header.id)) {
        return next();
    }

    const observer = addon.observers.get(payload.header.id);
    if (error !== null) {
        observer.error(new Error(error));

        return next();
    }

    observer.next(body);
    if (completed) {
        observer.complete();
    }

    return next();
});

slave.on("event", (payload, next) => {
    addon.emit(payload.name, payload.from);
    next();
});

// Setup ready listener
addon.on("ready", () => slave.send("event", "ready"));

// Setup start listener
addon.on("start", () => {
    addon.on("message", (messageId, target, args) => {
        const header = { from: addon.name, id: messageId };
        slave.send("message", { header, data: { target, args } });
    });
    slave.send("event", "start");
});

// Setup stop listener
addon.on("stop", () => {
    addon.removeAllListeners("message", message);
    slave.send("event", "stop");
    setImmediate(process.exit);
});
