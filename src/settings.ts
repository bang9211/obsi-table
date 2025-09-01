import { App, PluginSettingTab, Setting } from 'obsidian';
import ObsiTablePlugin from '../main';

export interface TableManagerSettings {
	defaultRows: number;
	defaultColumns: number;
	enableSorting: boolean;
	enableStyling: boolean;
	tableTheme: string;
	autoFormat: boolean;
	showLineNumbers: boolean;
	enableTableToolbar: boolean;
	toolbarPosition: 'top' | 'bottom';
}

export const DEFAULT_SETTINGS: TableManagerSettings = {
	defaultRows: 3,
	defaultColumns: 3,
	enableSorting: true,
	enableStyling: true,
	tableTheme: 'default',
	autoFormat: true,
	showLineNumbers: false,
	enableTableToolbar: true,
	toolbarPosition: 'top',
};

export class TableManagerSettingTab extends PluginSettingTab {
	plugin: ObsiTablePlugin;

	constructor(app: App, plugin: ObsiTablePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Table Manager Settings' });

		new Setting(containerEl)
			.setName('Default rows')
			.setDesc('Default number of rows when creating a new table')
			.addText((text) =>
				text
					.setPlaceholder('3')
					.setValue(this.plugin.settings.defaultRows.toString())
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.defaultRows = num;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName('Default columns')
			.setDesc('Default number of columns when creating a new table')
			.addText((text) =>
				text
					.setPlaceholder('3')
					.setValue(this.plugin.settings.defaultColumns.toString())
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.defaultColumns = num;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName('Enable sorting')
			.setDesc('Enable click-to-sort functionality on table headers')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableSorting)
					.onChange(async (value) => {
						this.plugin.settings.enableSorting = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Enable styling')
			.setDesc('Enable visual customization features')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableStyling)
					.onChange(async (value) => {
						this.plugin.settings.enableStyling = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Table theme')
			.setDesc('Choose the default theme for tables')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('default', 'Default')
					.addOption('minimal', 'Minimal')
					.addOption('bordered', 'Bordered')
					.addOption('striped', 'Striped')
					.setValue(this.plugin.settings.tableTheme)
					.onChange(async (value) => {
						this.plugin.settings.tableTheme = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Auto format')
			.setDesc('Automatically format tables when editing')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoFormat)
					.onChange(async (value) => {
						this.plugin.settings.autoFormat = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Show line numbers')
			.setDesc('Show line numbers in table editor')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showLineNumbers)
					.onChange(async (value) => {
						this.plugin.settings.showLineNumbers = value;
						await this.plugin.saveSettings();
					})
			);

		// Toolbar Settings Section
		containerEl.createEl('h3', { text: 'Table Toolbar Settings' });

		new Setting(containerEl)
			.setName('Enable table toolbar')
			.setDesc('Show the table toolbar below the editing toolbar')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableTableToolbar)
					.onChange(async (value) => {
						this.plugin.settings.enableTableToolbar = value;
						await this.plugin.saveSettings();
						
						// Refresh toolbar
						if (this.plugin.toolbarManager) {
							if (value) {
								this.plugin.toolbarManager.refresh();
							} else {
								this.plugin.toolbarManager.destroy();
							}
						}
					})
			);

		new Setting(containerEl)
			.setName('Toolbar position')
			.setDesc('Position of the table toolbar relative to the editing toolbar')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('top', 'Above editing toolbar')
					.addOption('bottom', 'Below editing toolbar')
					.setValue(this.plugin.settings.toolbarPosition)
					.onChange(async (value) => {
						this.plugin.settings.toolbarPosition = value as 'top' | 'bottom';
						await this.plugin.saveSettings();
						
						// Refresh toolbar to apply new position
						if (this.plugin.toolbarManager && this.plugin.settings.enableTableToolbar) {
							this.plugin.toolbarManager.refresh();
						}
					})
			);
	}
}