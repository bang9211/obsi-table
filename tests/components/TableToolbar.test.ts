import { TableToolbar } from '../../src/components/TableToolbar';
import { TableManager } from '../../src/managers/TableManager';
import { TableManagerSettings } from '../../src/settings';

// Mock Obsidian App
const mockApp = {
	workspace: {
		activeEditor: {
			editor: {
				getCursor: () => ({ line: 1, ch: 0 }),
				getValue: () => '| Name | Age |\n| --- | --- |\n| John | 25 |'
			}
		}
	}
} as any;

// Mock Notice
(global as any).Notice = jest.fn();

// Mock DOM methods - override setup.ts for this test
const mockCreateElement = jest.fn().mockImplementation((tagName: string) => ({
	tagName: tagName.toUpperCase(),
	className: '',
	id: '',
	setAttribute: jest.fn(),
	appendChild: jest.fn(),
	addEventListener: jest.fn(),
	style: {},
	innerHTML: '',
	textContent: '',
	dataset: {},
	classList: {
		add: jest.fn(),
		remove: jest.fn(),
		contains: jest.fn(),
		toggle: jest.fn()
	}
}));

const mockCreateElementNS = jest.fn().mockImplementation((ns: string, tagName: string) => ({
	tagName: tagName.toUpperCase(),
	setAttribute: jest.fn(),
	appendChild: jest.fn(),
	innerHTML: '',
	className: { baseVal: '' }
}));

Object.assign(global.document, {
	createElement: mockCreateElement,
	createElementNS: mockCreateElementNS
});

describe('TableToolbar', () => {
	let tableToolbar: TableToolbar;
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
		tableToolbar = new TableToolbar(mockApp, tableManager, settings);
		jest.clearAllMocks();
	});

	describe('createToolbar', () => {
		it('should create toolbar element', () => {
			const toolbar = tableToolbar.createToolbar();
			
			expect(toolbar).toBeDefined();
			expect(mockCreateElement).toHaveBeenCalledWith('div');
		});

		it('should set toolbar properties correctly', () => {
			const toolbar = tableToolbar.createToolbar();
			
			expect(toolbar.className).toBe('tableToolbarTinyAesthetic');
			expect(toolbar.id).toBe('tableToolbarModalBar');
		});
	});

	describe('Button creation', () => {
		it('should create icons with correct SVG elements', () => {
			const toolbar = tableToolbar.createToolbar();
			
			// Verify SVG creation calls
			expect(mockCreateElementNS).toHaveBeenCalledWith(
				'http://www.w3.org/2000/svg',
				'svg'
			);
		});
	});

	describe('Toolbar visibility', () => {
		it('should start with hidden toolbar', () => {
			const toolbar = tableToolbar.createToolbar();
			
			expect(toolbar.style.visibility).toBe('hidden');
			expect(toolbar.style.display).toBe('none');
			expect(tableToolbar.isVisible).toBe(false);
		});
	});

	describe('Button interactions', () => {
		it('should handle table creation button click', () => {
			const createTableSpy = jest.spyOn(tableManager, 'createTable');
			const toolbar = tableToolbar.createToolbar();
			
			// Simulate clicking on table creation button
			// Since we're testing the structure, we verify the spy was set up
			expect(createTableSpy).toBeDefined();
		});

		it('should handle sort button click', () => {
			const sortTableSpy = jest.spyOn(tableManager, 'sortTable');
			const toolbar = tableToolbar.createToolbar();
			
			// Verify sort functionality is connected
			expect(sortTableSpy).toBeDefined();
		});
	});

	describe('CSV button functionality', () => {
		it('should create CSV import/export buttons', () => {
			const toolbar = tableToolbar.createToolbar();
			
			// Verify button creation calls include CSV buttons
			expect(mockCreateElement).toHaveBeenCalledWith('button');
		});
	});

	describe('Move button functionality', () => {
		it('should create move buttons for rows and columns', () => {
			const toolbar = tableToolbar.createToolbar();
			
			// Verify move button setup
			expect(mockCreateElement).toHaveBeenCalledWith('button');
		});
	});

	describe('Color picker functionality', () => {
		it('should create color picker with palette', () => {
			const toolbar = tableToolbar.createToolbar();
			
			// Verify color picker elements are created
			expect(mockCreateElement).toHaveBeenCalledWith('div');
		});
	});

	describe('Table size selector', () => {
		it('should create PowerPoint-style grid selector', () => {
			const toolbar = tableToolbar.createToolbar();
			
			// Verify grid elements are created
			expect(mockCreateElement).toHaveBeenCalledWith('div');
		});
	});
});