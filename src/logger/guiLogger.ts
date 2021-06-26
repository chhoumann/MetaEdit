import {Notice} from "obsidian";
import type QuickAdd from "../main";
import {ErrorLevel} from "./errorLevel";
import {MetaEditLogger} from "./logger";

export class GuiLogger extends MetaEditLogger {
    constructor(private plugin: QuickAdd) {
        super();
    }

    logError(msg: string): void {
        const error = this.getMetaEditError(msg, ErrorLevel.Error);
        new Notice(this.formatOutputString(error));
    }

    logWarning(msg: string): void {
        const warning = this.getMetaEditError(msg, ErrorLevel.Warning);
        new Notice(this.formatOutputString(warning));
    }

    logMessage(msg: string): void {}
}