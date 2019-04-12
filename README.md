# Core
The Core was created to load the SlimIO addons, it is able to get a connection communication channel (IPC) between each addons.

## Requirements
- Node.js v10 or higher

## Getting Started

This package is available in the Node Package Repository and can be easily installed with [npm](https://docs.npmjs.com/getting-started/what-is-npm) or [yarn](https://yarnpkg.com).

```bash
$ npm i @slimio/core
# or
$ yarn add @slimio/core
```

## Usage example

A script that demonstrate how to load a default core (JSON Configure will be created dynamically).

```js
const Core = require("@slimio/core");

async function main() {
    console.time("start_core");
    const core = await (new Core(__dirname)).initialize();
    console.timeEnd("start_core");

    // Handle exit signal!
    process.on("SIGINT", () => {
        console.error("Exiting SlimIO Agent (please wait)");
        core.exit().then(() => {
            setImmediate(process.exit);
        }).catch(function mainErrorHandler(error) {
            console.error(error);
            process.exit(1);
        });
    });
}
main().catch(console.error);
```

## API

### constructor(dirname: string, options?)
Create a new instance of Core Object. The argument `dirname` is the root directory where the core have to load his configuration and all addons.

The constructor take an optional options object which contain all options to configure the core Agent.
```ts
interface ConstructorOptions {
    silent?: boolean;
    autoReload?: number;
}
```

### initialize(): Promise<this>
Initialize the Core (it will load configuration and addons). The loading of addons is lazy, so the response will be returned before the addons have had time to fully load.

### exit(): Promise<void>
Stop the core and all affiliated ressources (addons, config etc..).

> Note: Think to exit the process with an iteration + 1 (with setImmediate).

## License
MIT
