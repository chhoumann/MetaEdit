import type {IOnFileModifyAutomator} from "./IOnFileModifyAutomator";
import type MetaEdit from "../../main";
import type {App, TFile} from "obsidian";
import type {OnModifyAutomatorType} from "./onModifyAutomatorType";

export abstract class OnFileModifyAutomator implements IOnFileModifyAutomator {
    protected plugin: MetaEdit;
    protected app: App;
    public type: OnModifyAutomatorType;

    protected constructor(plugin: MetaEdit, type: OnModifyAutomatorType) {
        this.plugin = plugin;
        this.app = plugin.app;
        this.type = type;
    }

    public abstract onFileModify(file: TFile): Promise<void>;
}