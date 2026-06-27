import type MetaEdit from "../main";
import {type EventRef, type Menu, type TAbstractFile, TFile, TFolder} from "obsidian";

export class LinkMenu {
    private targetFile: TFile;
    private targetFolder: TFolder;
    private eventRef: EventRef;
    private filesEventRef: EventRef;

    constructor(private plugin: MetaEdit) {}

    public registerEvent(): void {
        this.eventRef = this.plugin.app.workspace.on('file-menu',
            (menu, file, source) => this.onMenuOpenCallback(menu, file, source));
        this.plugin.registerEvent(this.eventRef);

        // 'files-menu' fires for a multi-selection in the file explorer.
        this.filesEventRef = this.plugin.app.workspace.on('files-menu',
            (menu, files, source) => this.onFilesMenuOpenCallback(menu, files, source));
        this.plugin.registerEvent(this.filesEventRef);
    }

    public unregisterEvent(): void {
        if (this.eventRef){
            this.plugin.app.workspace.offref(this.eventRef);
        }
        if (this.filesEventRef){
            this.plugin.app.workspace.offref(this.filesEventRef);
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

    private onFilesMenuOpenCallback(menu: Menu, files: TAbstractFile[], source: string) {
        if (source !== "file-explorer-context-menu") return;
        if (!Array.isArray(files) || files.length === 0) return;

        const hasMarkdown = files.some(f =>
            (f instanceof TFile && f.extension === "md") ||
            (f instanceof TFolder && f.children?.some(c => c instanceof TFile && c.extension === "md")));
        if (!hasMarkdown) return;

        menu.addItem(item => {
            item.setIcon('pencil');
            item.setTitle("Bulk edit metadata in selected notes");
            item.onClick(async () => {
                await this.plugin.runBulkEditForSelection(files);
            });
        });
    }

    private addFileOptions(menu: Menu) {
        menu.addItem(item => {
            item.setIcon('pencil');
            item.setTitle("Edit Meta");
            item.onClick(async () => {
                await this.plugin.runMetaEditForFile(this.targetFile);
            })
        })
    }

    private addFolderOptions(menu: Menu) {
        menu.addItem(item => {
            item.setIcon('pencil');
            item.setTitle("Bulk edit metadata in this folder (and subfolders)");
            item.onClick(async () => {
                await this.plugin.runMetaEditForFolder(this.targetFolder);
            })
        })
    }
}