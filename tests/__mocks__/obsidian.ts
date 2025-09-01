// Mock implementation of Obsidian API for testing

export class App {
	workspace = {
		activeEditor: {
			editor: {
				getCursor: () => ({ line: 0, ch: 0 }),
				getValue: () => '',
				replaceRange: jest.fn(),
				getLine: (lineNumber: number) => '',
				lineCount: () => 1
			}
		}
	};
}

export class Editor {
	getCursor = jest.fn().mockReturnValue({ line: 0, ch: 0 });
	getValue = jest.fn().mockReturnValue('');
	replaceRange = jest.fn();
	getLine = jest.fn().mockReturnValue('');
	lineCount = jest.fn().mockReturnValue(1);
}

export class Notice {
	constructor(message: string, timeout?: number) {
		// Mock implementation - just store the message
		(this as any).message = message;
		(this as any).timeout = timeout;
	}
}

export class Plugin {
	app: App;
	manifest: any;
	
	constructor(app: App, manifest: any) {
		this.app = app;
		this.manifest = manifest;
	}

	onload = jest.fn();
	onunload = jest.fn();
	addRibbonIcon = jest.fn();
	addCommand = jest.fn();
	addSettingTab = jest.fn();
	loadData = jest.fn().mockResolvedValue({});
	saveData = jest.fn().mockResolvedValue(undefined);
}

export class PluginSettingTab {
	app: App;
	plugin: Plugin;
	containerEl: HTMLElement;

	constructor(app: App, plugin: Plugin) {
		this.app = app;
		this.plugin = plugin;
		this.containerEl = document.createElement('div');
	}

	display = jest.fn();
	hide = jest.fn();
}

export class Setting {
	constructor(containerEl: HTMLElement) {
		// Mock implementation
	}

	setName = jest.fn().mockReturnThis();
	setDesc = jest.fn().mockReturnThis();
	addText = jest.fn().mockReturnThis();
	addToggle = jest.fn().mockReturnThis();
	addDropdown = jest.fn().mockReturnThis();
}

// Export commonly used interfaces
export interface WorkspaceLeaf {
	view: any;
}

export interface TFile {
	path: string;
	name: string;
	extension: string;
}