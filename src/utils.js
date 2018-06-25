/**
 * @namespace utils
 */
// Require Node.JS dependencie(s)
const { join } = require("path");
const {
    promises: {
        readdir,
        lstat,
        access
    },
    constants: { R_OK, X_OK }
} = require("fs");

// Require third-party dependencie(s)
const is = require("@sindresorhus/is");

/**
 * @async
 * @function searchForAddons
 * @exports utils/searchForAddons
 * @memberof utils
 * @desc Search for valid addons on the agent disk
 * @param {!String} root root system path
 * @returns {Object}
 */
async function searchForAddons(root) {
    if (!is.string(root)) {
        throw new TypeError("utils.searchForValidAddonsOnDisk->root should be typeof <string>");
    }
    const rootFiles = new Set(await readdir(root));
    if (!rootFiles.has("addons")) {
        return [];
    }

    // Get all addons directory
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
            Reflect.set(ret, addonName, {});
        }
        catch (err) {
            continue;
        }
    }

    return ret;
}

module.exports = {
    searchForAddons
};
