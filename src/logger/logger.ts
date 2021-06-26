import type {ILogger} from "./ilogger";
import type {ErrorLevel} from "./errorLevel";
import type {MetaEditError} from "./metaEditError";

export abstract class MetaEditLogger implements ILogger{
     abstract logError(msg: string): void;

    abstract logMessage(msg: string): void;

    abstract logWarning(msg: string): void;

    protected formatOutputString(error: MetaEditError): string {
        return `MetaEdit: (${error.level}) ${error.message}`;
    }

    protected getMetaEditError(message: string, level: ErrorLevel): MetaEditError {
        return {message, level, time: Date.now()};
    }
}