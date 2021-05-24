import {debounce, Notice, Plugin, TAbstractFile, TFile} from 'obsidian';
import {MetaEditSettingsTab} from "./Settings/metaEditSettingsTab";
import MEMainSuggester from "./Modals/metaEditSuggester";
import MetaController from "./metaController";
import type {MetaEditSettings} from "./Settings/metaEditSettings";
import {DEFAULT_SETTINGS} from "./Settings/defaultSettings";
import {LinkMenu} from "./Modals/LinkMenu";
import type {Property} from "./parser";
import type {IMetaEditApi} from "./IMetaEditApi";
import {MetaEditApi} from "./MetaEditApi";

export default class MetaEdit extends Plugin {
    public settings: MetaEditSettings;
    public linkMenu: LinkMenu;
    public api: IMetaEditApi;
    private controller: MetaController;
    private updatedFileCache: { [fileName: string]: { content: string, updateTime: number } } = {};
    private onModifyCallback = debounce(async (file: TAbstractFile) => {
       if (file instanceof TFile) {
           await this.onModifyProxy(file, async (pFile, fileContent) => {
               if (this.settings.ProgressProperties.enabled) {
                   await this.updateProgressProperties(pFile);
               }
               if (this.settings.KanbanHelper.enabled) {
                   await this.kanbanHelper(pFile, fileContent);
               }
           })
       }
    }, 4000, false);

    async onload() {
        this.controller = new MetaController(this.app, this);
        console.log('Loading MetaEdit');

        await this.loadSettings();

        /*START.DEVCMD*/
        this.addCommand({
            id: 'reloadMetaEdit',
            name: 'Reload MetaEdit (dev)',
            callback: () => { // @ts-ignore - for this.app.plugins
                const id: string = this.manifest.id, plugins = this.app.plugins;
                plugins.disablePlugin(id).then(() => plugins.enablePlugin(id));
            },
        });
        /*END.DEVCMD*/

        this.addCommand({
            id: 'metaEditRun',
            name: 'Run MetaEdit',
            callback: async () => {
                const file: TFile = this.getCurrentFile();
                if (!file) return;

                await this.runMetaEditForFile(file);
            }
        });

        this.onModifyCallbackToggle(true);

        this.addSettingTab(new MetaEditSettingsTab(this.app, this));
        this.linkMenu = new LinkMenu(this);

        if (this.settings.UIElements.enabled) {
            this.linkMenu.registerEvent();
        }

        this.api = new MetaEditApi(this).make();
    }

    public async runMetaEditForFile(file: TFile) {
        const data: Property[] = await this.controller.getPropertiesInFile(file);
        if (!data) return;

        const suggester: MEMainSuggester = new MEMainSuggester(this.app, this, data, file, this.controller);
        suggester.open();
    }

    onunload() {
        console.log('Unloading MetaEdit');
        this.onModifyCallbackToggle(false);
        this.linkMenu.unregisterEvent();
    }

    public getCurrentFile(): TFile {
        try {
            const currentFile = this.app.workspace.getActiveFile();

            if (currentFile.extension === "md")
                return currentFile;

            this.logError("file is not a markdown file.");
            return null;
        }
        catch (e) {
            this.logError("could not get current file content.");
            return null;
        }
    }

    public onModifyCallbackToggle(enable: boolean) {
        if (enable) {
            this.app.vault.on("modify", this.onModifyCallback);
        } else if (this.onModifyCallback && !enable) {
            this.app.vault.off("modify", this.onModifyCallback);
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    public logError(error: string) {
        new Notice(`MetaEdit: ${error}`);
    }

    public getFilesWithProperty(property: string): TFile[] {
        const markdownFiles = this.app.vault.getMarkdownFiles();
        let files: TFile[] = [];

        markdownFiles.forEach(file => {
            const fileCache = this.app.metadataCache.getFileCache(file);

            if (fileCache) {
                const fileFrontmatter = fileCache.frontmatter;

                if (fileFrontmatter && fileFrontmatter[property]) {
                    files.push(file);
                }
            }
        });

        return files;
    }

    private async updateProgressProperties(file: TFile) {
        const data = await this.controller.getPropertiesInFile(file);
        if (!data) return;

        await this.controller.handleProgressProps(data, file);
    }

    private async onModifyProxy(file: TFile, callback: (file: TFile, fileContent: string) => void) {
        const fileContent = await this.app.vault.read(file);

        if (!this.updatedFileCache[file.name] || fileContent !== this.updatedFileCache[file.name].content) {
            this.updatedFileCache[file.name] = {
                content: fileContent,
                updateTime: Date.now(),
            };

            await callback(file, fileContent);
        }

        this.cleanCache();
    }

    private cleanCache() {
        const five_minutes = 18000;

        for (let cacheItem in this.updatedFileCache) {
            if (this.updatedFileCache[cacheItem].updateTime < Date.now() - five_minutes) {
                delete this.updatedFileCache[cacheItem];
            }
        }
    }

    private async kanbanHelper(file: TFile, fileContent: string) {
        const boards = this.settings.KanbanHelper.boards;
        const board = boards.find(board => board.boardName === file.basename);
        const fileCache = this.app.metadataCache.getFileCache(file);

        if (board && fileCache) {
            const {links} = fileCache;

            if (links) {
                for (const link of links) {
                    const linkFile: TAbstractFile = this.app.vault.getAbstractFileByPath(`${link.link}.md`);

                    if (linkFile instanceof TFile) {
                        const heading = this.getTaskHeading(link.link, fileContent);
                        if (!heading) {
                            this.logError("could not open linked file (KanbanHelper)");
                            return;
                        }

                        const fileProperties: Property[] = await this.controller.getPropertiesInFile(linkFile);
                        if (!fileProperties) return;
                        const targetProperty = fileProperties.find(prop => prop.key === board.property);
                        if (!targetProperty) return;

                        await this.controller.updatePropertyInFile(targetProperty, heading, linkFile);
                    }
                }
            }
        }
    }

    private getTaskHeading(taskName: string, fileContent: string): string | null {
        const MARKDOWN_HEADING = new RegExp(/#+\s+(.+)/);
        const TASK_REGEX = new RegExp(/(\s*)-\s*\[([ Xx\.]?)\]\s*(.+)/, "i");

        let lastHeading: string = "";
        const splitContent = fileContent.split("\n");
        for (const line of splitContent) {
            const heading = MARKDOWN_HEADING.exec(line);
            if (heading) {
                lastHeading = heading[1];
            }

            const taskMatch = TASK_REGEX.exec(line);
            if (taskMatch && taskMatch[3] === `[[${taskName}]]`) {
                return lastHeading;
            }
        }

        return null;
    }
}

