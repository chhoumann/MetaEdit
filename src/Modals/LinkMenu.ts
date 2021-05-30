import type MetaEdit from "../main";
import {EventRef, Menu, TAbstractFile, TFile, TFolder} from "obsidian";

export class LinkMenu {
    private targetFile: TFile;
    private targetFolder: TFolder;
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
        const bCorrectSource: boolean = (source === "link-context-menu" ||
            source === "calendar-context-menu" ||
            source =="file-explorer-context-menu");
        if (bCorrectSource)
        {
            if (file instanceof TFile && file.extension === "md") {
                this.targetFile = file;
                this.addFileOptions(menu);
            }
            if (file instanceof TFolder && file.children && file.children.some(f => f instanceof TFile && f.extension === "md")) {
                this.targetFolder = file;
                this.addFolderOptions(menu);
            }
        }
    }

    private addFileOptions(menu: Menu) {
        menu.addItem(item => {
            item.setIcon('pencil');
            item.setTitle("Edit Meta");
            item.onClick(async evt => {
                await this.plugin.runMetaEditForFolder(this.targetFolder);
            })
        })
    }

    private addFolderOptions(menu: Menu) {
        menu.addItem(item => {
            item.setIcon('pencil');
            item.setTitle("Add YAML property to all files in this folder (and subfolders)");
            item.onClick(async evt => {
                await this.plugin.runMetaEditForFolder(this.targetFolder);
            })
        })
    }
}