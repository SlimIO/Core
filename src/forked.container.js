require("make-promises-safe");

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

/**
 * @function main
 * @return {void}
 */
function main() {
    /**
     * @async
     * @func message
     * @param {any} payload message payload
     * @returns {Promise<void>}
     */
    async function message(payload) {
        if (payload.target === 1) {
            const { messageId, callback, args = [] } = payload.data;
            try {
                const responseBody = await addon.executeCallback(callback, ...args);
                process.send({ target: 1, data: { messageId, body: responseBody } });
            }
            catch ({ message }) {
                process.send({ target: 1, data: { messageId, error: message } });
            }
        }
        else if (payload.target === 2) {
            const { messageId, body, error = null, completed = true } = payload.data;
            // Return if there is no message
            if (!addon.observers.has(messageId)) {
                return void 0;
            }

            const observer = addon.observers.get(messageId);
            if (error !== null) {
                observer.error(new Error(error));

                return void 0;
            }

            if (typeof body !== "undefined") {
                observer.next(body);
            }
            if (completed) {
                observer.complete();
            }
        }
        else if (payload.target === 3) {
            const { eventData = [] } = payload.data;
            addon.emit(payload.data.eventName, ...eventData);
        }

        return void 0;
    }
    process.on("message", message);

    // Setup ready listener
    addon.on("ready", () => {
        console.log(`[${addon.name.toUpperCase()}] Ready event triggered!`);
        process.send({ target: 3, data: "ready" });
    });

    // Setup start listener
    addon.on("start", () => {
        console.log(`[${addon.name.toUpperCase()}] Start event received!`);
        addon.on("message", (messageId, target, args) => {
            process.send({ target: 2, data: { messageId, target, args } });
        });
        process.send({ target: 3, data: "start" });
    });

    // Setup stop listener
    addon.on("stop", () => {
        console.log(`[${addon.name.toUpperCase()}] Stop event received!`);
        addon.removeAllListeners("message", message);
        process.send({ target: 3, data: "stop" });
        setImmediate(process.exit);
    });
}

// Call main handler
main();
