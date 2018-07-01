/// <reference types="node" />
/// <reference types="@types/node" />
/// <reference types="@types/es6-shim" />
/// <reference types="@slimio/addon" />
/// <reference types="@slimio/config" />

declare class Core {
    constructor(dirname: string, options?: Core.ConstructorOptions);

    // Properties
    readonly addons: Addon[];
    private _root: string;
    root: string;
    private _addons: Map<string, Addon>;
    config: Config<any>;

    static DEFAULTConfiguration: Core.CFG;
    static DEFAULTSchema: object;

    // Methods
    private loadAddon(addon: Addon): Promise<Addon>;
    private onAddonReconfiguration(addonName: string, newConfig: Core.AddonsCFG): void;
    initialize(): Promise<this>;
    exit(): Promise<void>
}

/**
 * Core namespace
 */
declare namespace Core {

    interface CallbackGetInfo {
        uid: string;
        name: string;
        started: boolean;
        callbacks: string[];
        flags: string[];
    }

    interface ConstructorOptions {
        autoReload?: number;
    }

    /**
     * Addons configuration
     */
    interface AddonsCFG {
        [key: string]: {
            active: boolean;
            standalone?: boolean;
            isolate?: boolean;
        }
    }

    /**
     * Agent CFG Interface!
     */
    interface CFG {
        hostname: string;
        platform: string;
        release: string;
        addons: AddonsCFG;
    }

}

export as namespace Core;
export = Core;
