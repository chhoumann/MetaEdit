import type { TFile } from 'obsidian';
import type MetaEdit from '../../main';
import MetaEditParser from '../../parser';
import { OnFileModifyAutomator } from './onFileModifyAutomator';
import { OnModifyAutomatorType } from './onModifyAutomatorType';

export class ProgressPropertyHelper extends OnFileModifyAutomator {
    constructor(plugin: MetaEdit) {
        super(plugin, OnModifyAutomatorType.ProgressProperties);
    }

    async onFileModify(file: TFile): Promise<void> {
        const parser: MetaEditParser = new MetaEditParser();
        const data = await parser.getFileMetadata(file);
        if (!data) return;

        await this.plugin.controller?.handleProgressProps(data, file);
    }
}
