// Require NodeJS Dependencies
import { join, dirname } from "path";
import { fileURLToPath } from 'url';

// Require Third-party Dependencies
import dotenv from "dotenv";
import japa from "japa";

// Load env
dotenv.config();

// Recreate __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load all sub tests!
japa.configure({
    files: [
        // join(__dirname, "communication.js"),
        // join(__dirname, "utils.js"),
        // join(__dirname, "test.js"),
        join(__dirname, "wca.js")
    ]
});
