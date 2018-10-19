/**
 * @namespace utils
 */
// Require Node.JS dependencie(s)
const { join } = require("path");
const {
    promises: { readdir, lstat, access, writeFile },
    constants: { R_OK, X_OK }
} = require("fs");

/**
 * @typedef {Object.<string, {}>} emptyAddon
 */

/**
 * @async
 * @function searchForAddons
 * @exports utils/searchForAddons
 * @memberof utils
 * @desc Search for valid addons on the agent disk
 * @param {!String} root root system path
 * @returns {emptyAddon}
 */
async function searchForAddons(root) {
    if (typeof root !== "string") {
        throw new TypeError("utils.searchForAddons->root should be typeof <string>");
    }
    const rootFiles = new Set(await readdir(root));
    if (!rootFiles.has("addons")) {
        return {};
    }

    /** @type {emptyAddon} */
    const ret = Object.create(null);
    const addonsDir = join(root, "addons");
    const addons = await readdir(addonsDir);

    // Foreach get stats
    for (const addonName of addons) {
        const dirPath = join(addonsDir, addonName);

        // Apply specification verification here
        try {
            const stat = await lstat(dirPath);

            // Skip if this is not a directory!
            if (!stat.isDirectory()) {
                continue;
            }
            await access(join(dirPath, "index.js"), R_OK | X_OK);
            Reflect.set(ret, addonName, Object.create(null));
        }
        catch (err) {
            continue;
        }
    }

    return ret;
}

/**
 * @public
 * @function generateDump
 * @exports utils/generateDump
 * @desc Dump an error!
 * @memberof utils
 * @param {String=} root root directory
 * @param {!Error} error Error Object (or NodeJS error)
 * @returns {String}
 */
function generateDump(root = __dirname, error) {
    const timestamp = Date.now();
    const dumpFile = join(root, "debug", `debug_${timestamp}.json`);
    const dumpStr = JSON.stringify({
        date: new Date(timestamp).toString(),
        code: error.code || null,
        message: error.message || "",
        stack: error.stack ? error.stack.split("\n") : ""
    }, null, 4);

    setImmediate(() => {
        writeFile(dumpFile, dumpStr).catch(console.error);
    });

    return dumpFile;
}

module.exports = {
    searchForAddons,
    generateDump
};
