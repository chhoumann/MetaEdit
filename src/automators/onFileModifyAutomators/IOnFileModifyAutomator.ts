import type { TFile } from 'obsidian';
import type { OnModifyAutomatorType } from './onModifyAutomatorType';

export interface IOnFileModifyAutomator {
    onFileModify(file: TFile): Promise<void>;
    type: OnModifyAutomatorType;
}
