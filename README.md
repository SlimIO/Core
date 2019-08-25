# Core
The Core was created to load and manage SlimIO addons, it will create/handle communication between each addons.

<p align="center">
    <img src="https://i.imgur.com/POLYji8.png" width="400">
</p>

Each addon **are isolated from each others** (designed like **container above**).

## Requirements
- [Node.js](https://nodejs.org/en/) v10 or higher

## Features / Roles
- (Re)loading addons.
- Manage communication between addons.
- Retention of communications in case of anomalies.
- Monitoring isolation.

## Getting Started

This package is available in the Node Package Repository and can be easily installed with [npm](https://docs.npmjs.com/getting-started/what-is-npm) or [yarn](https://yarnpkg.com).

```bash
$ npm i @slimio/core
# or
$ yarn add @slimio/core
```

## Usage example
A script that demonstrate how to load a default core (Configuration will be created dynamically).

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

<details><summary>constructor(dirname: string, options?: Core.ConstructorOptions)</summary>
<br />

Create a new instance of Core Object. The argument `dirname` is the root directory where the core have to load his configuration and all addons.

The constructor take an optional options object which contain all options to configure the core Agent.
```ts
interface ConstructorOptions {
    silent?: boolean;
    autoReload?: number;
}
```
</details>

<details><summary>initialize(): Promise< this ></summary>
<br />

Initialize the Core (it will load configuration and addons). The loading of addons is lazy, so the response will be returned before the addons have had time to fully load.
</details>

<details><summary>exit(): Promise< void ></summary>
<br />

Stop the core and all affiliated ressources (addons, config etc..).

> Note: Think to exit the process with an iteration + 1 (with setImmediate).
</details>

## Dependencies

|Name|Refactoring|Security Risk|Usage|
|---|---|---|---|
|[@slimio/addon](https://github.com/SlimIO/Addon#readme)|⚠️Major|High|Addon default class|
|[@slimio/config](https://github.com/SlimIO/Config#readme)|Minor|High|Configuration interaction|
|[@slimio/ipc](https://github.com/SlimIO/ipc#readme)|⚠️Major|High|Inter-process communication|
|[@slimio/is](https://github.com/SlimIO/is#readme)|Minor|Low|Type checker|
|[@slimio/safe-emitter](https://github.com/SlimIO/safeEmitter#readme)|Minor|High|Safe emittter|
|[@slimio/scheduler](https://github.com/SlimIO/Scheduler#readme)|Minor|Low|Scheduler|
|[@slimio/utils](https://github.com/SlimIO/Utils#readme)|Minor|High|Bunch of useful functions|
|[make-promises-safe](https://github.com/mcollina/make-promises-safe#readme)|⚠️Major|High|Promise not exit process when fail|

## License
MIT
