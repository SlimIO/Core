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
            const header = payload.header;
            const { callback, args = [] } = payload.data;
            try {
                const responseBody = await addon.executeCallback(callback, header, ...args);

                // TODO: Implement stream!
                process.send({ target: 1, header, data: { body: responseBody } });
            }
            catch (error) {
                process.send({ target: 1, header, data: { error: error.message } });
            }
        }
        else if (payload.target === 2) {
            const { body, error = null, completed = true } = payload.data;
            // Return if there is no message
            if (!addon.observers.has(payload.header.id)) {
                return void 0;
            }

            const observer = addon.observers.get(payload.header.id);
            if (error !== null) {
                observer.error(new Error(error));

                return void 0;
            }

            observer.next(body);
            if (completed) {
                observer.complete();
            }
        }
        else if (payload.target === 3) {
            addon.emit(payload.data, payload.header.from);
        }

        return void 0;
    }
    process.on("message", message);

    // Setup ready listener
    addon.on("ready", () => {
        process.send({ target: 3, data: "ready" });
    });

    // Setup start listener
    addon.on("start", () => {
        addon.on("message", (messageId, target, args) => {
            const header = { from: addon.name, id: messageId };
            process.send({ target: 2, header, data: { target, args } });
        });
        process.send({ target: 3, data: "start" });
    });

    // Setup stop listener
    addon.on("stop", () => {
        addon.removeAllListeners("message", message);
        process.send({ target: 3, data: "stop" });
        setImmediate(process.exit);
    });
}

// Call main handler
main();
