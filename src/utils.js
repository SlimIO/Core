/**
 * @namespace utils
 */
// Require Node.JS dependencie(s)
const { promisify } = require("util");
const { join } = require("path");
const {
    readdir,
    lstat,
    access,
    constants: { R_OK, W_OK, X_OK }
} = require("fs");

// Require third-party dependencie(s)
const is = require("@sindresorhus/is");

// Asynchronous FS Wrapper
const FSAsync = {
    lstat: promisify(lstat),
    readdir: promisify(readdir),
    access: promisify(access)
};

/**
 * @async
 * @function searchForValidAddonsOnDisk
 * @exports utils/searchForValidAddonsOnDisk
 * @desc Search for valid addons on the agent disk
 * @param {!String} root root system path
 * @returns {Object}
 */
async function searchForValidAddonsOnDisk(root) {
    if (!is.string(root)) {
        throw new TypeError("utils.searchForValidAddonsOnDisk->root should be typeof <string>");
    }
    const rootFiles = new Set(await FSAsync.readdir(root));
    if (!rootFiles.has("addons")) {
        return [];
    }

    // Get all addons directory
    const ret = {};
    const addonsDir = join(root, "addons");
    const addons = await FSAsync.readdir(addonsDir);

    // Foreach get stats
    for (const addonName of addons) {
        const dirPath = join(addonsDir, addonName);
        const stat = await FSAsync.lstat(dirPath);

        // Skip if this is not a directory!
        if (!stat.isDirectory()) {
            continue;
        }

        // Apply specification verification here
        try {
            await FSAsync.access(join(dirPath, "index.js"), R_OK | X_OK);
            // await FSAsync.access(join(dirPath, `${addonName}.config.json`), R_OK | W_OK);
            Reflect.set(ret, addonName, {});
        }
        catch (err) {
            continue;
        }
    }

    return ret;
}

module.exports = {
    searchForValidAddonsOnDisk
};
