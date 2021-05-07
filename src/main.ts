import {Plugin} from 'obsidian';
import {MetaEditSettingsTab} from "./metaEditSettingsTab";
import MetaEditSuggester from "./MetaEditSuggester/metaEditSuggester";
import MetaController from "./metaController";

interface MetaEditSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MetaEditSettings = {
	mySetting: 'default'
}

export default class MetaEdit extends Plugin {
	private settings: MetaEditSettings;
	private controller: MetaController;

	async onload() {
		this.controller = new MetaController(this.app);
		console.log('Loading MetaEdit');

		await this.loadSettings();

		if (process.env.BUILD !== 'production') {
			this.addCommand({
				id: 'reloadMetaEdit',
				name: 'Reload MetaEdit (dev)',
				callback: () => { // @ts-ignore - for this.app.plugins
					const id: string = this.manifest.id, plugins = this.app.plugins;
					plugins.disablePlugin(id).then(() => plugins.enablePlugin(id));
				},
			});
		}

		this.addCommand({
			id: 'metaEditRun',
			name: 'Run MetaEdit',
			callback: async () => {
				const data = await this.controller.GetForCurrentFile();

				const suggester: MetaEditSuggester = new MetaEditSuggester(this.app, this);
				suggester.open();
			}
		})

		this.addSettingTab(new MetaEditSettingsTab(this.app, this));
	}

	onunload() {
		console.log('Unloading MetaEdit');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

