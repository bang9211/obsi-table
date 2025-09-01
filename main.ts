import { Plugin } from 'obsidian';
import { TableManagerSettings, TableManagerSettingTab, DEFAULT_SETTINGS } from './src/settings';
import { TableManager } from './src/managers/TableManager';
import { ToolbarManager } from './src/managers/ToolbarManager';

export default class ObsiTablePlugin extends Plugin {
	settings!: TableManagerSettings;
	tableManager!: TableManager;
	toolbarManager!: ToolbarManager;

	async onload() {
		console.log('Loading Obsidian Table Manager plugin');

		// Load settings
		await this.loadSettings();

		// Initialize table manager
		this.tableManager = new TableManager(this.app, this.settings);

		// Regenerate CSS for existing colored cells after plugin restart
		try {
			console.log('🎨 Regenerating CSS for existing colored table cells...');
			await this.tableManager.regenerateColorCSS();
			console.log('✅ CSS regeneration completed');
		} catch (error) {
			console.error('❌ Error during CSS regeneration:', error);
		}

		// Initialize event-based CSS regeneration
		this.tableManager.initializeColorCSSEvents();

		// Initialize toolbar manager
		this.toolbarManager = new ToolbarManager(this.app, this.tableManager, this.settings);
		this.toolbarManager.initialize();

		// Periodic check disabled - using event-based system instead
		// this.registerInterval(window.setInterval(() => {
		// 	this.toolbarManager.recreateToolbarIfNeeded();
		// }, 5000)); // Check every 5 seconds

		// Add ribbon icon
		this.addRibbonIcon('table', 'Create Table', () => {
			this.tableManager.createTable(3, 3);
		});

		// Add commands
		this.addCommand({
			id: 'create-table',
			name: 'Create Table',
			callback: () => {
				this.tableManager.createTable(3, 3);
			}
		});

		this.addCommand({
			id: 'insert-row',
			name: 'Insert Row',
			callback: () => {
				this.tableManager.insertRow();
			}
		});

		this.addCommand({
			id: 'insert-column',
			name: 'Insert Column',
			callback: () => {
				this.tableManager.insertColumn();
			}
		});

		this.addCommand({
			id: 'delete-row',
			name: 'Delete Row',
			callback: () => {
				this.tableManager.deleteRow();
			}
		});

		this.addCommand({
			id: 'delete-column',
			name: 'Delete Column',
			callback: () => {
				this.tableManager.deleteColumn();
			}
		});

		this.addCommand({
			id: 'sort-table',
			name: 'Sort Table',
			callback: () => {
				this.tableManager.sortTable();
			}
		});

		// Enhanced debug command for toolbar
		this.addCommand({
			id: 'debug-toolbar',
			name: 'Debug Toolbar Status',
			callback: () => {
				console.log('=== Enhanced Toolbar Debug Info ===');
				
				if (this.toolbarManager) {
					const debugStatus = this.toolbarManager.getDebugStatus();
					console.table(debugStatus);
					
					// Additional DOM checks
					const editingToolbar = document.querySelector('.editingToolbarTinyAesthetic');
					const allToolbars = document.querySelectorAll('[class*="toolbar"]');
					
					console.log('🔍 DOM Analysis:');
					console.log('  Editing toolbar found:', !!editingToolbar);
					console.log('  All toolbar elements:', allToolbars.length);
					console.log('  Table toolbar z-index:', this.toolbarManager.tableToolbar?.toolbarElement?.style.zIndex || 'default');
					
					if (editingToolbar) {
						const editingStyle = window.getComputedStyle(editingToolbar);
						console.log('  Editing toolbar z-index:', editingStyle.zIndex);
						console.log('  Editing toolbar position:', editingStyle.position);
					}
				} else {
					console.error('❌ ToolbarManager not initialized');
				}
			}
		});

		// Command to force toolbar recreation
		this.addCommand({
			id: 'force-recreate-toolbar',
			name: 'Force Recreate Toolbar',
			callback: () => {
				if (this.toolbarManager) {
					console.log('🔧 Force recreating toolbar...');
					this.toolbarManager.forceRecreate();
				} else {
					console.error('❌ ToolbarManager not available');
				}
			}
		});

		// Add debug command for color CSS regeneration
		this.addCommand({
			id: 'debug-color-css',
			name: 'Debug Color CSS Status',
			callback: async () => {
				console.log('=== Color CSS Debug Info ===');
				
				if (this.tableManager) {
					// Check current document for color classes
					const currentColors = this.tableManager.scanCurrentDocumentForColors();
					console.log('Current document color classes:', Array.from(currentColors));
					
					// Check DOM for existing style elements
					const existingStyles = document.querySelectorAll('style[id^="table-cell-style-cell-bg-"]');
					console.log('Existing CSS style elements:', existingStyles.length);
					existingStyles.forEach(style => {
						console.log(`  - ${style.id}`);
					});
					
					// Manually trigger CSS regeneration
					console.log('Manually triggering CSS regeneration...');
					await this.tableManager.regenerateColorCSS();
				}
			}
		});

		// Add command to manually regenerate CSS
		this.addCommand({
			id: 'regenerate-color-css',
			name: 'Manually Regenerate Color CSS',
			callback: async () => {
				if (this.tableManager) {
					console.log('🔧 Manually regenerating color CSS...');
					try {
						await this.tableManager.regenerateColorCSS();
						console.log('✅ Manual CSS regeneration completed');
					} catch (error) {
						console.error('❌ Manual CSS regeneration failed:', error);
					}
				}
			}
		});

		// Add settings tab
		this.addSettingTab(new TableManagerSettingTab(this.app, this));

		console.log('Obsidian Table Manager plugin loaded successfully');
	}

	async onunload() {
		console.log('Unloading Obsidian Table Manager plugin');
		
		// Cleanup dynamically generated CSS styles
		if (this.tableManager) {
			try {
				console.log('🧹 Cleaning up dynamically generated CSS...');
				this.tableManager.cleanupColorCSS();
				console.log('✅ CSS cleanup completed');
			} catch (error) {
				console.error('❌ Error during CSS cleanup:', error);
			}
		}
		
		// Cleanup toolbar manager
		if (this.toolbarManager) {
			this.toolbarManager.destroy();
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}