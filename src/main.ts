import {Plugin} from 'obsidian';
import {MetaEditSettingsTab} from "./metaEditSettingsTab";

interface MetaEditSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MetaEditSettings = {
	mySetting: 'default'
}

export default class MetaEdit extends Plugin {
	settings: MetaEditSettings;

	async onload() {
		console.log('Loading MetaEdit');

		await this.loadSettings();

		this.addStatusBarItem().setText('Status Bar Text');

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

