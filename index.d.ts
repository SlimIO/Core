/// <reference types="node" />
/// <reference types="@types/node" />
/// <reference types="@types/es6-shim" />
/// <reference types="@slimio/addon" />
/// <reference types="@slimio/config" />

declare class Core {
    constructor(dirname: string, options?: Core.ConstructorOptions);

    // Properties
    root: string;
    addons: Map<string, Addon>;
    config: Config<any>;

    static DEFAULT_CONFIGURATION: Core.CFG;
    static DEFAULT_SCHEMA: object;

    // Methods
    private setupAddonListener(addon: Addon): Promise<Addon>;
    private setupAddonConfiguration(addonName: string, newConfig: Core.AddonsCFG): void;
    initialize(): Promise<this>;
    generateDump(error: object): string;
    exit(): Promise<void>;
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
        silent?: boolean;
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
