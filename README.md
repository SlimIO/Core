# Core
![version](https://img.shields.io/badge/dynamic/json.svg?url=https://raw.githubusercontent.com/SlimIO/core/master/package.json&query=$.version&label=Version)
[![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-green.svg)](https://github.com/SlimIO/core/commit-activity)
[![mit](https://img.shields.io/github/license/Naereen/StrapDown.js.svg)](https://github.com/SlimIO/core/blob/master/LICENSE)
![dep](https://img.shields.io/david/SlimIO/core)
![size](https://img.shields.io/github/languages/code-size/SlimIO/core)

The Core was created to load and manage SlimIO addons, it will create/handle communication between each addons.

<p align="center">
    <img src="https://i.imgur.com/POLYji8.png" width="400">
</p>

Each addon **are isolated from each others** (designed like **container above**). You may be interested by the [Gate](https://github.com/SlimIO/Gate) addon as well if you want to learn how the core work and behave at higher level.

## Requirements
- [Node.js](https://nodejs.org/en/) v12 or higher

## Features / Roles
- (Re)loading addons.
- Manage communication between addons.
- Retention of communications in case of anomalies.
- Monitoring isolation.

The core as clean and well defined roles to be as much stable possible. Behavior related to addons communication and data exposition will be all related to the Gate addon (which is the right hand of the core). As an addon there is no way to talk to the core directly.

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
import "make-promises-safe";

import { fileURLToPath } from 'url';
import { dirname } from 'path';

import Core from "@slimio/core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

## Global
The core register himself as a global with the name `slimio_core`.

```js
console.log(global.slimio_core);
```

The current core version is also available as `global.coreVersion`.

## API

<details><summary>constructor(dirname: string, options?: Core.ConstructorOptions)</summary>
<br />

Create a new instance of Core Object. The argument `dirname` is the root directory where the core have to load his configuration and all addons.

The constructor take an optional options object which contain all options to configure the core Agent.
```ts
interface ConstructorOptions {
    silent?: boolean;
    autoReload?: number;
    toml?: boolean;
}
```
</details>

<details><summary>initialize(): Promise< this ></summary>
<br />

Initialize the Core (it will load configuration and addons). The loading of addons is lazy, so the response will be returned before the addons have had time to fully load.
</details>

<details><summary>searchForLockedAddons(addonName: string): IterableIterator< string ></summary>
<br />

Search locked addons for a given **addonName**.
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
|[@slimio/logger](https://github.com/SlimIO/logger)|Minor|Low|Sonic Logger with low overhead for SlimIO|
|[@slimio/safe-emitter](https://github.com/SlimIO/safeEmitter#readme)|Minor|High|Safe emittter|
|[@slimio/scheduler](https://github.com/SlimIO/Scheduler#readme)|Minor|Low|Scheduler|
|[@slimio/utils](https://github.com/SlimIO/Utils#readme)|Minor|High|Bunch of useful functions|
|[is-stream](https://github.com/sindresorhus/is-stream#readme)|Minor|Low|TBC|
|[make-promises-safe](https://github.com/mcollina/make-promises-safe#readme)|⚠️Major|High|Promise not exit process when fail|
|[semver](https://github.com/npm/node-semver)|⚠️Major|Low|Semver parser/utilities for node|
|[uuid](https://github.com/kelektiv/node-uuid#readme)|Minor|Low|Simple, fast generation of RFC4122 UUIDS.|

## License
MIT
