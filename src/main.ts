import {debounce, Notice, Plugin, TAbstractFile, TFile, TFolder} from 'obsidian';
import {MetaEditSettingsTab} from "./Settings/metaEditSettingsTab";
import MEMainSuggester from "./Modals/metaEditSuggester";
import MetaController from "./metaController";
import type {MetaEditSettings} from "./Settings/metaEditSettings";
import {DEFAULT_SETTINGS} from "./Settings/defaultSettings";
import {LinkMenu} from "./Modals/LinkMenu";
import type {Property} from "./parser";
import type {IMetaEditApi} from "./IMetaEditApi";
import {MetaEditApi} from "./MetaEditApi";
import {UniqueQueue} from "./uniqueQueue";
import {UpdatedFileCache} from "./updatedFileCache";
import GenericPrompt from "./Modals/GenericPrompt/GenericPrompt";

export default class MetaEdit extends Plugin {
    public settings: MetaEditSettings;
    public linkMenu: LinkMenu;
    public api: IMetaEditApi;
    private controller: MetaController;
    private updateFileQueue: UniqueQueue<TFile>;
    private updatedFileCache: UpdatedFileCache;
    private update = debounce(async () => {
        while (!this.updateFileQueue.isEmpty()) {
            const file = this.updateFileQueue.dequeue();

            if (this.settings.ProgressProperties.enabled) {
                await this.updateProgressProperties(file);
            }
            if (this.settings.KanbanHelper.enabled) {
                await this.kanbanHelper(file);
            }
        }
    }, 5000, true);

    async onload() {
        this.controller = new MetaController(this.app, this);
        this.updateFileQueue = new UniqueQueue<TFile>();
        this.updatedFileCache = new UpdatedFileCache();

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
        const currentFile = this.abstractFileToMarkdownTFile(this.app.workspace.getActiveFile());

        if (!currentFile) {
            this.logError("could not get current file content.");
            return null;
        }

        return currentFile;
    }

    public abstractFileToMarkdownTFile(file: TAbstractFile): TFile {
        if (file instanceof TFile && file.extension === "md")
            return file;
        
        return null;
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

    private onModifyCallback = async (file: TAbstractFile) => await this.onModify(file);

    private async onModify(file: TAbstractFile) {
        const outfile: TFile = this.abstractFileToMarkdownTFile(file);
        if (!outfile) return;

        const fileContent = await this.app.vault.cachedRead(outfile);
        if (!this.updatedFileCache.set(file.path, fileContent)) return;

        if (this.updateFileQueue.enqueue(outfile)) {
            await this.update();
        }
    }

    private async updateProgressProperties(file: TFile) {
        const data = await this.controller.getPropertiesInFile(file);
        if (!data) return;

        await this.controller.handleProgressProps(data, file);
    }

    private async kanbanHelper(file: TFile) {
        const fileContent = await this.app.vault.cachedRead(file);
        const boards = this.settings.KanbanHelper.boards;
        const board = boards.find(board => board.boardName === file.basename);
        const fileCache = this.app.metadataCache.getFileCache(file);

        if (board && fileCache) {
            const {links} = fileCache;

            if (links) {
                for (const link of links) {
                    // Because of how links are formatted, I have to do it this way.
                    // If there are duplicates (two files with the same name) for a link, the path will be in the link.
                    // If not, the link won't specify the folder. Therefore, we check all files.
                    const markdownFiles: TFile[] = this.app.vault.getMarkdownFiles();
                    const linkFile: TFile = markdownFiles.find(f => f.path.includes(`${link.link}.md`));

                    if (linkFile instanceof TFile) {
                        const headingAttempt1 = this.getTaskHeading(linkFile.path.replace('.md', ''), fileContent);
                        const headingAttempt2 = this.getTaskHeading(link.link, fileContent);
                        const heading = headingAttempt1 || headingAttempt2;

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

    public async runMetaEditForFolder(targetFolder: TFolder) {
        const pName = await GenericPrompt.Prompt(this.app, `Add a new property to all files in ${targetFolder.name} (and subfolders)`);
        if (!pName) return;

        const pVal = await GenericPrompt.Prompt(this.app, "Enter a value");
        if (!pVal) return;

        const updateFilesInFolder = async (targetFolder: TFolder, propertyName: string, propertyValue: string) => {
            for (const child of targetFolder.children) {
                if (child instanceof TFile && child.extension == "md")
                    await this.controller.addYamlProp(pName, pVal, child);

                if (child instanceof TFolder)
                    await updateFilesInFolder(child, propertyName, propertyValue);
            }
        }

        await updateFilesInFolder(targetFolder, pName, pVal);
    }
}

