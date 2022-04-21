import { ErrorLevel } from './errorLevel';
import { MetaEditLogger } from './logger';
import type { MetaEditError } from './metaEditError';

export class ConsoleErrorLogger extends MetaEditLogger {
    public ErrorLog: MetaEditError[] = [];

    public logError(errorMsg: string) {
        const error = this.getMetaEditError(errorMsg, ErrorLevel.Error);
        this.addMessageToErrorLog(error);

        console.error(this.formatOutputString(error));
    }

    public logWarning(warningMsg: string) {
        const warning = this.getMetaEditError(warningMsg, ErrorLevel.Warning);
        this.addMessageToErrorLog(warning);

        console.warn(this.formatOutputString(warning));
    }

    public logMessage(logMsg: string) {
        const log = this.getMetaEditError(logMsg, ErrorLevel.Log);
        this.addMessageToErrorLog(log);

        console.log(this.formatOutputString(log));
    }

    private addMessageToErrorLog(error: MetaEditError): void {
        this.ErrorLog.push(error);
    }
}
