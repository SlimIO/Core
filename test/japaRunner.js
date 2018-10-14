// Require NodeJS Dependencies
const { join } = require("path");

// Require Third-party Dependencies
const { configure } = require("japa");

// Load all sub tests!
configure({
    files: [
        join(__dirname, "communication.js"),
        join(__dirname, "test.js")
    ]
});
