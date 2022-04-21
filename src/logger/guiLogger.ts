import { Notice } from 'obsidian';
import { ErrorLevel } from './errorLevel';
import { MetaEditLogger } from './logger';

export class GuiLogger extends MetaEditLogger {
    constructor() {
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

    logMessage(msg: string): void {
        const message = this.getMetaEditError(msg, ErrorLevel.Log);
        new Notice(this.formatOutputString(message));
    }
}
