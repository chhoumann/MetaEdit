import type MetaEdit from "../main";
import {Menu, TFile} from "obsidian";

export class LinkMenu {
    private targetFile: TFile;

    constructor(private plugin: MetaEdit) {
        this.registerEvent();
    }

    registerEvent(): void {
        this.plugin.registerEvent(
            this.plugin.app.workspace.on('file-menu', (menu, file, source) => {
                console.log(source);
                if (source === "link-context-menu" && file instanceof TFile) {
                    this.targetFile = file;
                    this.addOptions(menu);
                }
            })
        )
    }

    private addOptions(menu: Menu) {
        menu.addItem(item => {
            item.setIcon('pencil');
            item.setTitle("Edit Meta");
            item.onClick(async evt => {
                await this.plugin.runMetaEditForFile(this.targetFile);
            })
        })
    }
}