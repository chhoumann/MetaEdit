import type { ErrorLevel } from './errorLevel';

export interface MetaEditError {
    message: string;
    level: ErrorLevel;
    time: number;
}
