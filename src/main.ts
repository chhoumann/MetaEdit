import {Plugin, TFile, TFolder} from 'obsidian';
import {MetaEditSettingsTab} from "./Settings/metaEditSettingsTab";
import MetaEditSuggester from "./Modals/metaEditSuggester";
import type {MetaEditSettings} from "./Settings/metaEditSettings";
import {DEFAULT_SETTINGS} from "./Settings/defaultSettings";
import {LinkMenu} from "./Modals/LinkMenu";
import type { Property } from "./Types/Property";
import type {IMetaEditApi} from "./IMetaEditApi";
import {MetaEditApi} from "./MetaEditApi";
import GenericPrompt from "./Modals/GenericPrompt/GenericPrompt";
import {getActiveMarkdownFile} from "./utility";
import {ConsoleErrorLogger} from "./logger/consoleErrorLogger";
import {GuiLogger} from "./logger/guiLogger";
import {log} from "./logger/logManager";
import {OnFileModifyAutomatorManager} from "./automators/onFileModifyAutomatorManager";
import type {IAutomatorManager} from "./automators/IAutomatorManager";
import {KanbanHelper} from "./automators/onFileModifyAutomators/kanbanHelper";
import {ProgressPropertyHelper} from "./automators/onFileModifyAutomators/progressPropertyHelper";
import {OnModifyAutomatorType} from "./automators/onFileModifyAutomators/onModifyAutomatorType";

export default class MetaEdit extends Plugin {
    public settings: MetaEditSettings;
    public linkMenu: LinkMenu;
    public api: IMetaEditApi;
    public controller: MetaController;
    private automatorManager: IAutomatorManager;

    async onload() {
        console.log('Loading MetaEdit');

        this.controller = new MetaController(this);

        await this.loadSettings();

        /*START.DEVCMD*/
        this.addCommand({
            id: 'reloadMetaEdit',
            name: 'Reload MetaEdit (dev)',
            callback: () => { // @ts-ignore - for app.plugins
                const id: string = this.manifest.id, plugins = app.plugins;
                plugins.disablePlugin(id).then(() => plugins.enablePlugin(id));
            },
        });
        /*END.DEVCMD*/

        this.addCommand({
            id: 'metaEditRun',
            name: 'Run MetaEdit',
            callback: async () => {
                const file: TFile = getActiveMarkdownFile();
                if (!file) return;

                await this.runMetaEditForFile(file);
            }
        });

        this.addSettingTab(new MetaEditSettingsTab(this));
        this.linkMenu = new LinkMenu(this);

        if (this.settings.UIElements.enabled) {
            this.linkMenu.registerEvent();
        }

        this.api = new MetaEditApi(this).make();

        log.register(new ConsoleErrorLogger())
			.register(new GuiLogger(this));

        this.automatorManager = new OnFileModifyAutomatorManager(this).startAutomators();
        this.toggleAutomators();
    }

    public toggleAutomators() {
        if (this.settings.KanbanHelper.enabled)
            this.automatorManager.attach(new KanbanHelper(this));
        else
            this.automatorManager.detach(OnModifyAutomatorType.KanbanHelper);

        if (this.settings.ProgressProperties.enabled)
            this.automatorManager.attach(new ProgressPropertyHelper(this));
        else
            this.automatorManager.detach(OnModifyAutomatorType.ProgressProperties);
    }

    public async runMetaEditForFile(file: TFile) {
        const data: Property[] = await this.controller.getPropertiesInFile(file);
        if (!data) return;

        const suggester: MetaEditSuggester = new MetaEditSuggester(app, this, data, file, this.controller);
        suggester.open();
    }

    onunload() {
        console.log('Unloading MetaEdit');
        this.linkMenu.unregisterEvent();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    public getFilesWithProperty(property: string): TFile[] {
        const markdownFiles = app.vault.getMarkdownFiles();
        let files: TFile[] = [];

        markdownFiles.forEach(file => {
            const fileCache = app.metadataCache.getFileCache(file);

            if (fileCache) {
                const fileFrontmatter = fileCache.frontmatter;

                if (fileFrontmatter && fileFrontmatter[property]) {
                    files.push(file);
                }
            }
        });

        return files;
    }

    public async runMetaEditForFolder(targetFolder: TFolder) {
        const pName = await GenericPrompt.Prompt(app, `Add a new property to all files in ${targetFolder.name} (and subfolders)`);
        if (!pName) return;

        const pVal = await GenericPrompt.Prompt(app, "Enter a value");
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

