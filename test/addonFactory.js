// Require NodeJS Dependencies
const { writeFile, mkdir } = require("fs").promises;
const { join } = require("path");

// Require Third-Party Dependencies
const { taggedString } = require("@slimio/utils");

// Helpers
const AddonParts = {
    require: "const Addon = require(\"@slimio/addon\");\n\n",
    create: taggedString`const ${0} = new Addon("${0}");\n\n`,
    export: taggedString`module.exports = ${0};\n`,
    callback: taggedString`${0}.registerCallback("${1}", async() => {\n    return ${2};\n});\n\n`,
    ready: taggedString`${0}.on(\"start\", () => {\n    ${0}.ready();\n});\n\n`
};

/**
 * @class AddonFactory
 */
class AddonFactory {

    /**
     * @constructor
     * @param {!String} name addonName
     */
    constructor(name) {
        this.name = name;
        this.callbacks = [];
    }

    /**
     * @public
     * @method createCallback
     * @param {!String} name callback name
     * @param {*} returnValue callback return value
     * @returns {this}
     */
    createCallback(name, returnValue) {
        if (typeof name !== "string") {
            throw new TypeError("name argument should be typeof string");
        }
        this.callbacks.push([name, returnValue.toString()]);

        return this;
    }

    /**
     * @public
     * @async
     * @method generate
     * @param {!String} path directory (or path) where we want to create the Addon
     * @returns {Promise<this>}
     *
     * @throws {TypeError}
     */
    async generate(path) {
        if (typeof path !== "string") {
            throw new TypeError("path argument should be typeof string");
        }

        // Create Addon dir
        const addonDir = join(path, this.name);
        await mkdir(addonDir);

        // Generate the Addon code
        const fRet = [AddonParts.require];
        fRet.push(AddonParts.create(this.name));
        for (const [name, returnValue] of this.callbacks) {
            fRet.push(AddonParts.callback(this.name, name, returnValue));
        }
        fRet.push(AddonParts.ready(this.name), AddonParts.export(this.name));

        // Write Index.js File
        await writeFile(join(addonDir, "index.js"), fRet.join(""));

        return this;
    }
}

module.exports = AddonFactory;
