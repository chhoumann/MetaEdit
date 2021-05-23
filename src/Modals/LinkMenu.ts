import type MetaEdit from "../main";
import {EventRef, Menu, TAbstractFile, TFile} from "obsidian";

export class LinkMenu {
    private targetFile: TFile;
    private eventRef: EventRef;

    constructor(private plugin: MetaEdit) {}

    public registerEvent(): void {
        this.eventRef = this.plugin.app.workspace.on('file-menu',
            (menu, file, source) => this.onMenuOpenCallback(menu, file, source));
        this.plugin.registerEvent(this.eventRef);
    }

    public unregisterEvent(): void {
        if (this.eventRef){
            this.plugin.app.workspace.offref(this.eventRef);
        }
    }

    private onMenuOpenCallback(menu: Menu, file: TAbstractFile, source: string) {
        if ((source === "link-context-menu" ||
            source === "calendar-context-menu" ||
            source =="file-explorer-context-menu")
            && file instanceof TFile)
        {
            this.targetFile = file;
            this.addOptions(menu);
        }
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