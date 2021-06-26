import type MetaEdit from "../../main";
import type {TFile} from "obsidian";
import {OnFileModifyAutomator} from "./onFileModifyAutomator";
import {OnModifyAutomatorType} from "./onModifyAutomatorType";

export class ProgressPropertyHelper extends OnFileModifyAutomator {
    constructor(plugin: MetaEdit) {
        super(plugin, OnModifyAutomatorType.ProgressProperties);
    }

    async onFileModify(file: TFile): Promise<void> {
        const data = await this.plugin.controller.getPropertiesInFile(file);
        if (!data) return;

        await this.plugin.controller.handleProgressProps(data, file);
    }
}