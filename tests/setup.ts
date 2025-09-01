// Jest setup file for global test configuration

// Mock global objects that might be used in tests
global.console = {
	...console,
	// Suppress console.log in tests unless needed
	log: jest.fn(),
	debug: jest.fn(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
};

// Mock DOM globals
(global.document as any) = {
	...global.document,
	createElement: jest.fn().mockImplementation((tagName: string) => ({
		tagName: tagName.toUpperCase(),
		className: '',
		id: '',
		style: {},
		innerHTML: '',
		textContent: '',
		setAttribute: jest.fn(),
		getAttribute: jest.fn(),
		appendChild: jest.fn(),
		removeChild: jest.fn(),
		addEventListener: jest.fn(),
		removeEventListener: jest.fn(),
		click: jest.fn(),
		querySelectorAll: jest.fn().mockReturnValue([]),
		querySelector: jest.fn().mockReturnValue(null),
		classList: {
			add: jest.fn(),
			remove: jest.fn(),
			contains: jest.fn(),
			toggle: jest.fn()
		},
		dataset: {}
	})),
	createElementNS: jest.fn().mockImplementation((namespace: string, tagName: string) => ({
		tagName: tagName.toUpperCase(),
		setAttribute: jest.fn(),
		getAttribute: jest.fn(),
		appendChild: jest.fn(),
		innerHTML: '',
		className: { baseVal: '' }
	})),
	body: {
		appendChild: jest.fn(),
		removeChild: jest.fn()
	} as any
};

// Mock window.navigator
Object.defineProperty(window, 'navigator', {
	value: {
		clipboard: {
			writeText: jest.fn().mockResolvedValue(undefined),
			readText: jest.fn().mockResolvedValue('')
		}
	},
	writable: true
});

// Mock FileReader
(global as any).FileReader = jest.fn().mockImplementation(() => ({
	readAsText: jest.fn(),
	onload: null,
	result: null,
	DONE: 2,
	EMPTY: 0,
	LOADING: 1
}));

// Mock setTimeout/clearTimeout for debouncing tests
(global as any).setTimeout = jest.fn().mockImplementation((fn: Function, delay?: number) => {
	return fn();
});

(global as any).clearTimeout = jest.fn();