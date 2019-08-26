/**
 * @namespace utils
 */

// Require Node.JS dependencie(s)
import { join } from "path";
import { promises as fs, constants } from "fs";

// CONSTANTS
const { readdir, lstat, access, writeFile } = fs;
const { R_OK, X_OK } = constants;

/**
 * @typedef {object.<string, {}>} emptyAddon
 */

/**
 * @async
 * @function searchForAddons
 * @exports utils/searchForAddons
 * @memberof utils
 * @description Search for valid addons on the agent disk
 * @param {!string} root root system path
 * @returns {emptyAddon}
 */
export async function searchForAddons(root) {
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
 * @description Dump an error!
 * @memberof utils
 * @param {string} [root] root directory
 * @param {!Error} error Error Object (or NodeJS error)
 * @returns {string}
 */
export function generateDump(root = __dirname, error) {
    const timestamp = Date.now();
    const dumpFile = join(root, "debug", `debug_${timestamp}.json`);
    const dumpStr = JSON.stringify({
        date: new Date(timestamp).toString(),
        code: error.code || null,
        message: typeof error === "string" ? error : error.message || "",
        stack: error.stack ? error.stack.split("\n") : ""
    }, null, 4);

    setImmediate(() => {
        writeFile(dumpFile, dumpStr).catch(console.error);
    });

    return dumpFile;
}
