// Mock Notice first
const mockNotice = jest.fn();

// Mock the Notice class from obsidian
jest.mock('obsidian', () => {
	const originalModule = jest.requireActual('../../tests/__mocks__/obsidian.ts');
	return {
		...originalModule,
		Notice: mockNotice
	};
});

import { TableManager } from '../../src/managers/TableManager';
import { TableManagerSettings } from '../../src/settings';

// Mock Obsidian App
const mockApp = {
	workspace: {
		activeEditor: {
			editor: {
				getCursor: () => ({ line: 1, ch: 0 }),
				getValue: () => '| Name | Age |\n| --- | --- |\n| John | 25 |',
				replaceRange: jest.fn()
			}
		}
	}
} as any;



// Mock navigator.clipboard for CSV tests
Object.assign(navigator, {
	clipboard: {
		writeText: jest.fn().mockResolvedValue(undefined)
	}
});

describe('TableManager', () => {
	let tableManager: TableManager;
	let settings: TableManagerSettings;

	beforeEach(() => {
		settings = {
			defaultRows: 3,
			defaultColumns: 3,
			enableSorting: true,
			enableStyling: true,
			tableTheme: 'default',
			autoFormat: true,
			showLineNumbers: false,
			enableTableToolbar: true,
			toolbarPosition: 'top' as const
		};
		tableManager = new TableManager(mockApp, settings);
		jest.clearAllMocks();
		mockNotice.mockClear();
	});

	describe('isSortAscending', () => {
		it('should return initial sort direction', () => {
			expect(tableManager.isSortAscending).toBe(true);
		});
	});

	describe('createTable', () => {
		it('should create table with default dimensions', () => {
			const mockEditor = mockApp.workspace.activeEditor.editor;
			mockEditor.replaceRange = jest.fn();

			tableManager.createTable();

			expect(mockEditor.replaceRange).toHaveBeenCalled();
			expect(mockNotice).toHaveBeenCalledWith('Table created: 3x3');
		});

		it('should create table with specified dimensions', () => {
			const mockEditor = mockApp.workspace.activeEditor.editor;
			mockEditor.replaceRange = jest.fn();

			tableManager.createTable(2, 4);

			expect(mockEditor.replaceRange).toHaveBeenCalled();
			expect(mockNotice).toHaveBeenCalledWith('Table created: 2x4');
		});
	});

	describe('exportTableToCSV', () => {
		it('should export table to clipboard as CSV', async () => {
			await tableManager.exportTableToCSV();

			expect(navigator.clipboard.writeText).toHaveBeenCalled();
			expect(mockNotice).toHaveBeenCalledWith('Table exported to clipboard as CSV');
		});
	});

	describe('Performance optimization methods', () => {
		it('should cache parsed tables', () => {
			const content = '| Name | Age |\n| --- | --- |\n| John | 25 |';
			
			// First call should parse and cache
			const table1 = (tableManager as any).optimizedTableParse(content, 1);
			
			// Second call should use cache
			const table2 = (tableManager as any).optimizedTableParse(content, 1);
			
			expect(table1).toEqual(table2);
		});

		it('should clear old cache entries', () => {
			const tableManager = new TableManager(mockApp, settings);
			const performanceCache = (tableManager as any).performanceCache;
			
			// Add old cache entry
			performanceCache.set('old_entry', { timestamp: Date.now() - 20000, data: {} });
			
			(tableManager as any).clearOldCache();
			
			expect(performanceCache.has('old_entry')).toBe(false);
		});
	});

	describe('CSV parsing', () => {
		it('should parse simple CSV line', () => {
			const line = 'John,25,New York';
			const result = (tableManager as any).parseCSVLine(line);
			expect(result).toEqual(['John', '25', 'New York']);
		});

		it('should parse CSV line with quotes', () => {
			const line = '"John, Jr.",25,"New York, NY"';
			const result = (tableManager as any).parseCSVLine(line);
			expect(result).toEqual(['John, Jr.', '25', 'New York, NY']);
		});

		it('should escape CSV cells correctly', () => {
			const content = 'John, Jr.';
			const result = (tableManager as any).escapeCsvCell(content);
			expect(result).toBe('"John, Jr."');
		});
	});

	describe('Move operations', () => {
		it('should validate row indices for moveRow', () => {
			const mockEditor = mockApp.workspace.activeEditor.editor;
			mockEditor.replaceRange = jest.fn();

			// This should show a notice about invalid indices
			tableManager.moveRow(-1, 0);
			expect(mockNotice).toHaveBeenCalled();
		});

		it('should validate column indices for moveColumn', () => {
			const mockEditor = mockApp.workspace.activeEditor.editor;
			mockEditor.replaceRange = jest.fn();

			// This should show a notice about invalid indices
			tableManager.moveColumn(-1, 0);
			expect(mockNotice).toHaveBeenCalled();
		});
	});

	describe('HTML tag stripping for sorting', () => {
		it('should strip HTML tags for sorting comparison', () => {
			// Test the private stripHtmlTags method
			const result1 = (tableManager as any).stripHtmlTags('<div class="cell-bg-ff6b6b">Apple</div>');
			expect(result1).toBe('Apple');
			
			const result2 = (tableManager as any).stripHtmlTags('<span style="background-color: #ff0000">Zebra</span>');
			expect(result2).toBe('Zebra');
			
			const result3 = (tableManager as any).stripHtmlTags('Plain text');
			expect(result3).toBe('Plain text');
			
			const result4 = (tableManager as any).stripHtmlTags('&nbsp;&amp;&lt;&gt;');
			expect(result4).toBe('&<>'); // Updated expected result
		});

		it('should sort cells by text content ignoring HTML tags', () => {
			const mockEditor = mockApp.workspace.activeEditor.editor;
			
			// Create content with HTML-formatted cells that should sort by text content
			const content = `| Name | Value |
| --- | --- |
| <div class="cell-bg-ff0000">Zebra</div> | 30 |
| <span style="background-color: #00ff00">Apple</span> | 10 |
| <div class="cell-bg-0000ff">Banana</div> | 20 |`;
			
			mockEditor.getValue = jest.fn().mockReturnValue(content);
			mockEditor.getCursor = jest.fn().mockReturnValue({ line: 1, ch: 0 });
			
			// Mock replaceRange to capture the sorted result
			let sortedContent = '';
			mockEditor.replaceRange.mockImplementation((newContent: string) => {
				sortedContent = newContent;
			});
			
			// Sort by first column (Name)
			tableManager.sortTable(0);
			
			// Verify that sorting was done by text content (Apple, Banana, Zebra) not HTML tags
			expect(sortedContent).toContain('Apple');
			expect(sortedContent).toContain('Banana');
			expect(sortedContent).toContain('Zebra');
			
			// The order should be alphabetical by text content
			const appleIndex = sortedContent.indexOf('Apple');
			const bananaIndex = sortedContent.indexOf('Banana');
			const zebraIndex = sortedContent.indexOf('Zebra');
			
			expect(appleIndex).toBeLessThan(bananaIndex);
			expect(bananaIndex).toBeLessThan(zebraIndex);
		});
	});
});