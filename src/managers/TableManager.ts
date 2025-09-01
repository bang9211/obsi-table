import { App, Editor, Notice } from 'obsidian';
import { TableManagerSettings } from '../settings';
import { MarkdownParser, ParsedTable } from '../utils/MarkdownParser';
import { TableValidator } from '../utils/TableValidator';

export class TableManager {
	app: App;
	settings: TableManagerSettings;
	private sortAscending: boolean = true;
	private lastSortedColumn: number = -1;
	private lastModifiedRow: number = -1;
	private lastModifiedColumn: number = -1;
	private performanceCache: Map<string, any> = new Map();
	private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

	constructor(app: App, settings: TableManagerSettings) {
		this.app = app;
		this.settings = settings;
	}

	get isSortAscending(): boolean {
		return this.sortAscending;
	}

	get lastModifiedRowIndex(): number {
		return this.lastModifiedRow;
	}

	get lastModifiedColumnIndex(): number {
		return this.lastModifiedColumn;
	}

	get lastSortedColumnIndex(): number {
		return this.lastSortedColumn;
	}

	// Performance optimization methods
	private debounce(key: string, func: () => void, delay: number = 300): void {
		// Clear existing timer
		const existingTimer = this.debounceTimers.get(key);
		if (existingTimer) {
			clearTimeout(existingTimer);
		}

		// Set new timer
		const timer = setTimeout(() => {
			func();
			this.debounceTimers.delete(key);
		}, delay);

		this.debounceTimers.set(key, timer);
	}

	private getCacheKey(operation: string, content: string): string {
		// Create a lightweight hash for caching
		let hash = 0;
		for (let i = 0; i < content.length; i++) {
			const char = content.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32bit integer
		}
		return `${operation}_${hash}`;
	}

	private isCacheValid(key: string, maxAge: number = 5000): boolean {
		const cached = this.performanceCache.get(key);
		if (!cached) return false;
		
		return (Date.now() - cached.timestamp) < maxAge;
	}

	private clearOldCache(): void {
		const now = Date.now();
		const maxAge = 10000; // 10 seconds

		for (const [key, value] of this.performanceCache.entries()) {
			if (now - value.timestamp > maxAge) {
				this.performanceCache.delete(key);
			}
		}
	}

	private optimizedTableParse(content: string, cursorLine: number): ParsedTable | null {
		const cacheKey = this.getCacheKey('parse', content);
		
		// Check cache first
		if (this.isCacheValid(cacheKey)) {
			const cached = this.performanceCache.get(cacheKey);
			return cached.data;
		}

		// Clear old cache entries periodically
		if (this.performanceCache.size > 50) {
			this.clearOldCache();
		}

		// Parse table
		const table = MarkdownParser.getTableAtCursor(content, cursorLine);

		// Cache result
		this.performanceCache.set(cacheKey, {
			data: table,
			timestamp: Date.now()
		});

		return table;
	}

	private optimizedTableUpdate(editor: any, table: ParsedTable): void {
		// For large tables, use debounced updates
		const tableSize = table.rows.length * (table.headers.cells?.length || 0);
		
		if (tableSize > 1000) { // Large table threshold
			this.debounce('table_update', () => {
				this.updateTable(editor, table);
			}, 500);
		} else {
			this.updateTable(editor, table);
		}
	}

	private processLargeTable(table: ParsedTable, operation: (table: ParsedTable) => void): void {
		const tableSize = table.rows.length * (table.headers.cells?.length || 0);
		
		if (tableSize > 5000) { // Very large table
			// Show progress for very large operations
			new Notice('Processing large table...', 2000);
			
			// Use setTimeout to prevent blocking UI
			setTimeout(() => {
				operation(table);
				new Notice('Large table processed successfully');
			}, 100);
		} else {
			operation(table);
		}
	}

	/**
	 * Strip HTML tags from text content to get the actual text for comparison
	 * Used for sorting cells with background colors or other HTML formatting
	 */
	private stripHtmlTags(content: string): string {
		// Remove all HTML tags and decode HTML entities
		return content
			.replace(/<[^>]*>/g, '') // Remove HTML tags
			.replace(/&nbsp;/g, ' ') // Replace non-breaking spaces
			.replace(/&amp;/g, '&') // Replace encoded ampersands
			.replace(/&lt;/g, '<') // Replace encoded less-than
			.replace(/&gt;/g, '>') // Replace encoded greater-than
			.replace(/&quot;/g, '"') // Replace encoded quotes
			.replace(/&#39;/g, "'") // Replace encoded apostrophes
			.trim(); // Remove leading/trailing whitespace
	}

	createTable(rows?: number, cols?: number): void {
		const activeEditor = this.app.workspace.activeEditor;
		if (!activeEditor?.editor) {
			new Notice('No active editor found');
			return;
		}

		const tableRows = rows || this.settings.defaultRows;
		const tableCols = cols || this.settings.defaultColumns;

		const table = MarkdownParser.createEmptyTable(tableRows, tableCols);
		const cursor = activeEditor.editor.getCursor();
		
		// Insert table at cursor position
		activeEditor.editor.replaceRange(table, cursor);
		
		new Notice(`Table created: ${tableRows}x${tableCols}`);
	}

	insertRow(): void {
		const activeEditor = this.app.workspace.activeEditor;
		if (!activeEditor?.editor) {
			new Notice('No active editor found');
			return;
		}

		const editor = activeEditor.editor;
		const cursor = editor.getCursor();
		const content = editor.getValue();

		const table = MarkdownParser.getTableAtCursor(content, cursor.line);
		if (!table) {
			new Notice('No table found at cursor position');
			return;
		}

		// Add empty row
		const newRow = Array.from({ length: table.headers.cells.length }, () => '');
		table.rows.push({ cells: newRow.map(content => ({ content })) });

		// Regenerate table
		const headers = table.headers.cells.map(cell => cell.content);
		const rows = table.rows.map(row => row.cells.map(cell => cell.content));
		const newTable = MarkdownParser.generateTable(headers, rows);

		// Replace old table with new one
		const startPos = { line: table.startLine, ch: 0 };
		const endPos = { line: table.endLine + 1, ch: 0 };
		editor.replaceRange(newTable + '\n', startPos, endPos);

		new Notice('Row inserted');
	}

	insertColumn(): void {
		const activeEditor = this.app.workspace.activeEditor;
		if (!activeEditor?.editor) {
			new Notice('No active editor found');
			return;
		}

		const editor = activeEditor.editor;
		const cursor = editor.getCursor();
		const content = editor.getValue();

		const table = MarkdownParser.getTableAtCursor(content, cursor.line);
		if (!table) {
			new Notice('No table found at cursor position');
			return;
		}

		// Add new column to headers
		table.headers.cells.push({ content: 'New Column' });
		
		// Add empty cell to each row
		table.rows.forEach(row => {
			row.cells.push({ content: '' });
		});

		// Regenerate table
		const headers = table.headers.cells.map(cell => cell.content);
		const rows = table.rows.map(row => row.cells.map(cell => cell.content));
		const newTable = MarkdownParser.generateTable(headers, rows);

		// Replace old table with new one
		const startPos = { line: table.startLine, ch: 0 };
		const endPos = { line: table.endLine + 1, ch: 0 };
		editor.replaceRange(newTable + '\n', startPos, endPos);

		new Notice('Column inserted');
	}

	deleteRow(): void {
		const activeEditor = this.app.workspace.activeEditor;
		if (!activeEditor?.editor) {
			new Notice('No active editor found');
			return;
		}

		const editor = activeEditor.editor;
		const cursor = editor.getCursor();
		const content = editor.getValue();

		const table = MarkdownParser.getTableAtCursor(content, cursor.line);
		if (!table) {
			new Notice('No table found at cursor position');
			return;
		}

		if (table.rows.length === 0) {
			new Notice('Cannot delete row: table has no data rows');
			return;
		}

		// Remove last row
		table.rows.pop();

		// Regenerate table
		const headers = table.headers.cells.map(cell => cell.content);
		const rows = table.rows.map(row => row.cells.map(cell => cell.content));
		const newTable = MarkdownParser.generateTable(headers, rows);

		// Replace old table with new one
		const startPos = { line: table.startLine, ch: 0 };
		const endPos = { line: table.endLine + 1, ch: 0 };
		editor.replaceRange(newTable + '\n', startPos, endPos);

		new Notice('Row deleted');
	}

	deleteColumn(): void {
		const activeEditor = this.app.workspace.activeEditor;
		if (!activeEditor?.editor) {
			new Notice('No active editor found');
			return;
		}

		const editor = activeEditor.editor;
		const cursor = editor.getCursor();
		const content = editor.getValue();

		const table = MarkdownParser.getTableAtCursor(content, cursor.line);
		if (!table) {
			new Notice('No table found at cursor position');
			return;
		}

		if (table.headers.cells.length <= 1) {
			new Notice('Cannot delete column: table must have at least one column');
			return;
		}

		// Remove last column from headers
		table.headers.cells.pop();
		
		// Remove last cell from each row
		table.rows.forEach(row => {
			if (row.cells.length > 0) {
				row.cells.pop();
			}
		});

		// Regenerate table
		const headers = table.headers.cells.map(cell => cell.content);
		const rows = table.rows.map(row => row.cells.map(cell => cell.content));
		const newTable = MarkdownParser.generateTable(headers, rows);

		// Replace old table with new one
		const startPos = { line: table.startLine, ch: 0 };
		const endPos = { line: table.endLine + 1, ch: 0 };
		editor.replaceRange(newTable + '\n', startPos, endPos);

		new Notice('Column deleted');
	}

	deleteTable(): void {
		const activeEditor = this.app.workspace.activeEditor;
		if (!activeEditor?.editor) {
			new Notice('No active editor found');
			return;
		}

		const editor = activeEditor.editor;
		const cursor = editor.getCursor();
		const content = editor.getValue();

		const table = MarkdownParser.getTableAtCursor(content, cursor.line);
		if (!table) {
			new Notice('No table found at cursor position');
			return;
		}

		// Delete entire table
		const startPos = { line: table.startLine, ch: 0 };
		const endPos = { line: table.endLine + 1, ch: 0 };
		editor.replaceRange('', startPos, endPos);

		new Notice('Table deleted');
	}

	sortTable(specifiedColumn?: number): void {
	const activeEditor = this.app.workspace.activeEditor;
	if (!activeEditor?.editor) {
		new Notice('No active editor found');
		return;
	}

	if (!this.settings.enableSorting) {
		new Notice('Sorting is disabled in settings');
		return;
	}

	const editor = activeEditor.editor;
	const cursor = editor.getCursor();
	const content = editor.getValue();

	// Use optimized table parsing
	const table = this.optimizedTableParse(content, cursor.line);
	if (!table) {
		new Notice('No table found at cursor position');
		return;
	}

	if (table.rows.length === 0) {
		new Notice('Cannot sort: table has no data rows');
		return;
	}

	// Store original cursor column index (logical position) before any operations
	const originalCursorColumnIndex = this.getCursorColumnIndex(table, cursor);
	const originalCursorRowIndex = this.getCursorRowIndex(table, cursor.line);

	// Determine which column to sort
	let sortColumnIndex: number;
	
	console.log(`[DEBUG] sortTable called with specifiedColumn: ${specifiedColumn}`);
	console.log(`[DEBUG] Current lastSortedColumn: ${this.lastSortedColumn}`);
	console.log(`[DEBUG] Original cursor column index: ${originalCursorColumnIndex}`);
	console.log(`[DEBUG] Original cursor row index: ${originalCursorRowIndex}`);
	
	if (specifiedColumn !== undefined) {
		// Column explicitly specified (from toolbar button or external call)
		sortColumnIndex = specifiedColumn;
		console.log(`[DEBUG] Using specified column: ${sortColumnIndex}`);
	} else {
		// No column specified - determine automatically
		if (originalCursorColumnIndex >= 0 && 
			this.lastSortedColumn >= 0 && 
			originalCursorColumnIndex !== this.lastSortedColumn) {
			// Cursor is in a valid column AND it's different from last sorted column
			// User wants to sort a different column
			sortColumnIndex = originalCursorColumnIndex;
			console.log(`[DEBUG] Using cursor column (different from last): ${sortColumnIndex}`);
		} else if (this.lastSortedColumn >= 0 && this.lastSortedColumn < table.headers.cells.length) {
			// Use last sorted column if available and valid
			sortColumnIndex = this.lastSortedColumn;
			console.log(`[DEBUG] Using last sorted column: ${sortColumnIndex}`);
		} else if (originalCursorColumnIndex >= 0) {
			// No valid last sorted column - use cursor position
			sortColumnIndex = originalCursorColumnIndex;
			console.log(`[DEBUG] Using cursor column (no last sorted): ${sortColumnIndex}`);
		} else {
			// Fallback to first column
			sortColumnIndex = 0;
			console.log(`[DEBUG] Using fallback column: ${sortColumnIndex}`);
		}
	}
	
	// Validate column index
	if (sortColumnIndex < 0 || sortColumnIndex >= table.headers.cells.length) {
		sortColumnIndex = 0;
		console.log(`[DEBUG] Column index validated to: ${sortColumnIndex}`);
	}
	
	console.log(`[DEBUG] Final sort column: ${sortColumnIndex}, previous lastSortedColumn: ${this.lastSortedColumn}`);
	
	// Handle direction toggle - only toggle if same column as last sorted
	if (this.lastSortedColumn === sortColumnIndex) {
		// Same column, toggle direction
		this.sortAscending = !this.sortAscending;
		console.log(`[DEBUG] Same column, toggled direction to: ${this.sortAscending ? 'ascending' : 'descending'}`);
	} else {
		// Different column, start with ascending
		this.sortAscending = true;
		console.log(`[DEBUG] Different column, starting with ascending`);
	}
	
	// Update lastSortedColumn AFTER determining toggle behavior
	this.lastSortedColumn = sortColumnIndex;
	console.log(`[DEBUG] Updated lastSortedColumn to: ${this.lastSortedColumn}`);

	// Use optimized sorting for large tables
		this.processLargeTable(table, (table) => {
			table.rows.sort((a, b) => {
				let aVal = a.cells[sortColumnIndex]?.content || '';
				let bVal = b.cells[sortColumnIndex]?.content || '';
				
				// Remove HTML tags to get the actual text content for comparison
				aVal = this.stripHtmlTags(aVal);
				bVal = this.stripHtmlTags(bVal);
				
				// Try to parse as numbers first, then fall back to string comparison
				const aNum = parseFloat(aVal);
				const bNum = parseFloat(bVal);
				
				let comparison;
				if (!isNaN(aNum) && !isNaN(bNum)) {
					comparison = aNum - bNum;
				} else {
					comparison = aVal.localeCompare(bVal);
				}
				
				return this.sortAscending ? comparison : -comparison;
			});

		// Use optimized table update
		this.optimizedTableUpdate(editor, table);

		// Restore cursor to logical position (same column, same row if possible)
		this.restoreCursorToLogicalPosition(editor, table, originalCursorColumnIndex, originalCursorRowIndex);

		const direction = this.sortAscending ? 'ascending' : 'descending';
		const columnName = table.headers.cells[sortColumnIndex]?.content || `column ${sortColumnIndex + 1}`;
		new Notice(`Table sorted ${direction} by ${columnName}`);
	});
}

	// Cursor-based methods for toolbar
	insertRowAtCursor(): void {
		const activeEditor = this.app.workspace.activeEditor;
		if (!activeEditor?.editor) {
			new Notice('No active editor found');
			return;
		}

		const editor = activeEditor.editor;
		const cursor = editor.getCursor();
		const content = editor.getValue();

		const table = MarkdownParser.getTableAtCursor(content, cursor.line);
		if (!table) {
			new Notice('No table found at cursor position');
			return;
		}

		// Calculate which row the cursor is in
		const cursorRowIndex = this.getCursorRowIndex(table, cursor.line);
		const insertAtIndex = cursorRowIndex >= 0 ? cursorRowIndex + 1 : table.rows.length;

		// Create new empty row
		const newRow = Array.from({ length: table.headers.cells.length }, () => '');
		const newRowData = { cells: newRow.map(content => ({ content })) };

		// Insert row at calculated position
		table.rows.splice(insertAtIndex, 0, newRowData);

		// Regenerate and replace table
		this.updateTable(editor, table);
		new Notice(`Row inserted at position ${insertAtIndex + 1}`);
	}

	insertColumnAtCursor(): void {
		const activeEditor = this.app.workspace.activeEditor;
		if (!activeEditor?.editor) {
			new Notice('No active editor found');
			return;
		}

		const editor = activeEditor.editor;
		const cursor = editor.getCursor();
		const content = editor.getValue();

		const table = MarkdownParser.getTableAtCursor(content, cursor.line);
		if (!table) {
			new Notice('No table found at cursor position');
			return;
		}

		// Calculate which column the cursor is in
		const cursorColumnIndex = this.getCursorColumnIndex(table, cursor);
		const insertAtIndex = cursorColumnIndex >= 0 ? cursorColumnIndex + 1 : table.headers.cells.length;

		// Insert new column header
		table.headers.cells.splice(insertAtIndex, 0, { content: 'New Column' });
		
		// Insert empty cell in each row at the same position
		table.rows.forEach(row => {
			row.cells.splice(insertAtIndex, 0, { content: '' });
		});

		// Regenerate and replace table
		this.updateTable(editor, table);
		new Notice(`Column inserted at position ${insertAtIndex + 1}`);
	}

	deleteRowAtCursor(): void {
		const activeEditor = this.app.workspace.activeEditor;
		if (!activeEditor?.editor) {
			new Notice('No active editor found');
			return;
		}

		const editor = activeEditor.editor;
		const cursor = editor.getCursor();
		const content = editor.getValue();

		const table = MarkdownParser.getTableAtCursor(content, cursor.line);
		if (!table) {
			new Notice('No table found at cursor position');
			return;
		}

		if (table.rows.length === 0) {
			new Notice('Cannot delete row: table has no data rows');
			return;
		}

		// Calculate which row the cursor is in
		const cursorRowIndex = this.getCursorRowIndex(table, cursor.line);
		
		if (cursorRowIndex >= 0 && cursorRowIndex < table.rows.length) {
			// Delete the specific row
			table.rows.splice(cursorRowIndex, 1);
			new Notice(`Row ${cursorRowIndex + 1} deleted`);
		} else {
			// Delete last row if cursor is not in a data row
			table.rows.pop();
			new Notice('Last row deleted');
		}

		// Regenerate and replace table
		this.updateTable(editor, table);
	}

	deleteColumnAtCursor(): void {
		const activeEditor = this.app.workspace.activeEditor;
		if (!activeEditor?.editor) {
			new Notice('No active editor found');
			return;
		}

		const editor = activeEditor.editor;
		const cursor = editor.getCursor();
		const content = editor.getValue();

		const table = MarkdownParser.getTableAtCursor(content, cursor.line);
		if (!table) {
			new Notice('No table found at cursor position');
			return;
		}

		if (table.headers.cells.length <= 1) {
			new Notice('Cannot delete column: table must have at least one column');
			return;
		}

		// Calculate which column the cursor is in
		const cursorColumnIndex = this.getCursorColumnIndex(table, cursor);
		
		if (cursorColumnIndex >= 0 && cursorColumnIndex < table.headers.cells.length) {
			// Delete the specific column
			table.headers.cells.splice(cursorColumnIndex, 1);
			table.rows.forEach(row => {
				if (row.cells.length > cursorColumnIndex) {
					row.cells.splice(cursorColumnIndex, 1);
				}
			});
			new Notice(`Column ${cursorColumnIndex + 1} deleted`);
		} else {
			// Delete last column if cursor is not in a specific column
			table.headers.cells.pop();
			table.rows.forEach(row => {
				if (row.cells.length > 0) {
					row.cells.pop();
				}
			});
			new Notice('Last column deleted');
		}

		// Regenerate and replace table
		this.updateTable(editor, table);
	}

	// Helper methods
	private getCursorRowIndex(table: ParsedTable, cursorLine: number): number {
		// Header is at startLine, separator at startLine + 1
		// Data rows start at startLine + 2
		const dataRowStartLine = table.startLine + 2;
		const rowIndex = cursorLine - dataRowStartLine;
		
		return (rowIndex >= 0 && rowIndex < table.rows.length) ? rowIndex : -1;
	}

	private getCursorColumnIndex(table: ParsedTable, cursor: { line: number; ch: number }): number {
	// Get the line content at cursor position
	const activeEditor = this.app.workspace.activeEditor;
	if (!activeEditor?.editor) {
		console.log('[DEBUG] getCursorColumnIndex: No active editor');
		return -1;
	}
	
	const content = activeEditor.editor.getValue();
	const lines = content.split('\n');
	
	console.log(`[DEBUG] getCursorColumnIndex: cursor at line ${cursor.line}, ch ${cursor.ch}`);
	console.log(`[DEBUG] getCursorColumnIndex: table range ${table.startLine}-${table.endLine}`);
	
	// Use header line or cursor line for column calculation
	let targetLine = '';
	if (cursor.line >= table.startLine && cursor.line <= table.endLine) {
		targetLine = lines[cursor.line] || '';
		console.log(`[DEBUG] getCursorColumnIndex: using cursor line: "${targetLine}"`);
	} else {
		// Use header line as fallback
		targetLine = lines[table.startLine] || '';
		console.log(`[DEBUG] getCursorColumnIndex: using header line as fallback: "${targetLine}"`);
	}
	
	// If line doesn't contain pipes, it's not a valid table line
	if (!targetLine.includes('|')) {
		console.log('[DEBUG] getCursorColumnIndex: line does not contain pipes');
		return -1;
	}
	
	// Find all pipe positions
	const pipePositions: number[] = [];
	for (let i = 0; i < targetLine.length; i++) {
		if (targetLine[i] === '|') {
			pipePositions.push(i);
		}
	}
	
	console.log(`[DEBUG] getCursorColumnIndex: pipe positions: [${pipePositions.join(', ')}]`);
	console.log(`[DEBUG] getCursorColumnIndex: cursor ch: ${cursor.ch}`);
	
	// If no pipes found or less than 2 pipes, invalid table
	if (pipePositions.length < 2) {
		console.log('[DEBUG] getCursorColumnIndex: insufficient pipes for table');
		return -1;
	}
	
	// Find which column the cursor is in
	let columnIndex = -1;
	for (let i = 0; i < pipePositions.length - 1; i++) {
		const startPipe = pipePositions[i];
		const endPipe = pipePositions[i + 1];
		
		console.log(`[DEBUG] getCursorColumnIndex: checking column ${i}: pipes at ${startPipe}-${endPipe}, cursor at ${cursor.ch}`);
		
		// Check if cursor is between these two pipes (inclusive of the boundaries for edge cases)
		if (cursor.ch > startPipe && cursor.ch <= endPipe) {
			columnIndex = i;
			console.log(`[DEBUG] getCursorColumnIndex: cursor found in column ${i} (between pipes ${startPipe}-${endPipe})`);
			break;
		}
	}
	
	// If still not found, check if cursor is at the very beginning (before first pipe)
	if (columnIndex === -1 && cursor.ch <= pipePositions[0]) {
		columnIndex = 0;
		console.log(`[DEBUG] getCursorColumnIndex: cursor at beginning, assigning to column 0`);
	}
	
	// If still not found, check if cursor is at the very end (after last pipe)
	if (columnIndex === -1 && cursor.ch > pipePositions[pipePositions.length - 1]) {
		columnIndex = pipePositions.length - 2; // Last valid column
		console.log(`[DEBUG] getCursorColumnIndex: cursor at end, assigning to last column ${columnIndex}`);
	}
	
	console.log(`[DEBUG] getCursorColumnIndex: calculated column index: ${columnIndex}`);
	console.log(`[DEBUG] getCursorColumnIndex: table has ${table.headers.cells.length} columns`);
	
	// Validate column index
	if (columnIndex >= 0 && columnIndex < table.headers.cells.length) {
		console.log(`[DEBUG] getCursorColumnIndex: returning valid column: ${columnIndex}`);
		return columnIndex;
	} else {
		console.log(`[DEBUG] getCursorColumnIndex: column index out of range, returning -1`);
		return -1;
	}
}

	private restoreCursorToLogicalPosition(editor: any, table: ParsedTable, targetColumnIndex: number, targetRowIndex: number): void {
		try {
			// Calculate target line based on row index
			let targetLine = table.startLine; // Default to header
			
			if (targetRowIndex >= 0 && targetRowIndex < table.rows.length) {
				// Restore to same data row (header + separator + row index)
				targetLine = table.startLine + 2 + targetRowIndex;
			} else {
				// Row no longer exists, use header line
				targetLine = table.startLine;
			}
			
			console.log(`[DEBUG] restoreCursor: target line ${targetLine}, target column ${targetColumnIndex}`);
			
			// Get the content of target line to calculate character position
			const content = editor.getValue();
			const lines = content.split('\n');
			const lineContent = lines[targetLine] || '';
			
			console.log(`[DEBUG] restoreCursor: line content: "${lineContent}"`);
			
			if (!lineContent.includes('|')) {
				console.log('[DEBUG] restoreCursor: target line is not a table line, using original position');
				return;
			}
			
			// Find pipe positions
			const pipePositions: number[] = [];
			for (let i = 0; i < lineContent.length; i++) {
				if (lineContent[i] === '|') {
					pipePositions.push(i);
				}
			}
			
			console.log(`[DEBUG] restoreCursor: pipe positions: [${pipePositions.join(', ')}]`);
			
			// Calculate character position for target column
			let targetCh = 0;
			
			if (targetColumnIndex >= 0 && targetColumnIndex < pipePositions.length - 1) {
				// Position cursor in the middle of the target column
				const startPipe = pipePositions[targetColumnIndex];
				const endPipe = pipePositions[targetColumnIndex + 1];
				targetCh = Math.floor((startPipe + endPipe) / 2);
			} else {
				// Invalid column index, position at beginning of line
				targetCh = pipePositions[0] + 1;
			}
			
			console.log(`[DEBUG] restoreCursor: calculated position line ${targetLine}, ch ${targetCh}`);
			
			// Set cursor position
			editor.setCursor({ line: targetLine, ch: targetCh });
			console.log(`[DEBUG] restoreCursor: cursor restored successfully`);
			
		} catch (error) {
			console.log(`[DEBUG] restoreCursor: error occurred: ${error}`);
		}
	}

	private updateTable(editor: any, table: ParsedTable): void {
		// Use standard Markdown table generation to maintain Obsidian table rendering
		const newTable = MarkdownParser.generateTable(table);

		// Replace old table with new one
		const startPos = { line: table.startLine, ch: 0 };
		const endPos = { line: table.endLine + 1, ch: 0 };
		editor.replaceRange(newTable + '\n', startPos, endPos);
	}

	setCellBackgroundColor(color: string, selectedCells?: Set<string>): void {
		const activeEditor = this.app.workspace.activeEditor;
		if (!activeEditor?.editor) {
			new Notice('No active editor found');
			return;
		}
		const editor = activeEditor.editor;
		
		console.log('setCellBackgroundColor called with color:', color);
		
		// Auto-detect based on selection
		if (selectedCells && selectedCells.size > 1) {
			console.log(`Auto-Mode: Multi-Cell (${selectedCells.size} cells selected)`);
			this.applyColorToMultipleCells(editor, color, selectedCells);
		} else if (selectedCells && selectedCells.size === 1) {
			console.log('Auto-Mode: Single-Cell (1 cell selected)');
			this.applyColorToMultipleCells(editor, color, selectedCells);
		} else {
			console.log('Auto-Mode: Cursor position (no selection)');
			const from = editor.getCursor('from');
			this.applyColorToSingleCellAtPosition(editor, color, from);
		}
	}

	private applyColorToMultipleCells(editor: any, color: string, selectedCells?: Set<string>): void {
		console.log('=== MULTI-CELL MODE - USING CUSTOM SELECTION ===');
		
		// Check if we have custom selected cells
		if (!selectedCells || selectedCells.size === 0) {
			console.log('❌ No selected cells provided, falling back to single cell mode');
			const cursor = editor.getCursor();
			this.applyColorToSingleCellAtPosition(editor, color, cursor);
			return;
		}
		
		console.log(`✅ Custom selection found: ${selectedCells.size} cells selected`);
		console.log('Selected cells:', Array.from(selectedCells).join(', '));
		
		// Get current table
		const cursor = editor.getCursor();
		const content = editor.getValue();
		const table = MarkdownParser.getTableAtCursor(content, cursor.line);
		
		if (!table) {
			new Notice('No table found at cursor position');
			return;
		}
		
		console.log(`Table found at lines ${table.startLine}-${table.endLine}`);
		
		// Apply color to each selected cell
		let cellsChanged = 0;
		console.log(`🔍 Processing ${selectedCells.size} selected cells:`, Array.from(selectedCells));
		
		selectedCells.forEach(cellCoord => {
			const parts = cellCoord.split(',');
			const rowIndex = parseInt(parts[0], 10);
			const colIndex = parseInt(parts[1], 10);
			const cellType = parts[2] || 'data'; // Default to 'data' for backward compatibility
			
			console.log(`🎨 Applying color to ${cellType} cell [${rowIndex}, ${colIndex}]`);
			console.log(`📊 Table info - Headers: ${table.headers.cells.length}, Data rows: ${table.rows.length}`);
			
			// Handle header cells vs data cells
			if (cellType === 'header') {
				console.log(`🎯 Processing HEADER cell - colIndex: ${colIndex}, available headers: ${table.headers.cells.length}`);
				console.log(`📝 Header cells content:`, table.headers.cells.map((c, i) => `[${i}]: "${c.content}"`));
				
				// Apply color to header cell
				if (colIndex >= 0 && colIndex < table.headers.cells.length) {
					console.log(`🎨 Before applying color - Header[${colIndex}] content: "${table.headers.cells[colIndex].content}"`);
					this.applyCellColor(table.headers.cells[colIndex], color);
					console.log(`🎨 After applying color - Header[${colIndex}] content: "${table.headers.cells[colIndex].content}"`);
					cellsChanged++;
					console.log(`✅ Header cell [0, ${colIndex}] color applied successfully`);
				} else {
					console.log(`❌ Invalid header cell coordinates: colIndex ${colIndex} out of range [0-${table.headers.cells.length - 1}]`);
				}
			} else {
				// Apply color to data cell
				if (rowIndex >= 0 && rowIndex < table.rows.length && 
					colIndex >= 0 && colIndex < table.rows[rowIndex].cells.length) {
					
					this.applyCellColor(table.rows[rowIndex].cells[colIndex], color);
					cellsChanged++;
					console.log(`✅ Data cell [${rowIndex}, ${colIndex}] color applied`);
				} else {
					console.log(`❌ Invalid data cell coordinates: [${rowIndex}, ${colIndex}]`);
				}
			}
		});
		
		if (cellsChanged > 0) {
			// Reconstruct and update the table
			const newTable = MarkdownParser.generateTable(table);
			const startPos = { line: table.startLine, ch: 0 };
			const endPos = { line: table.endLine + 1, ch: 0 };
			editor.replaceRange(newTable + '\n', startPos, endPos);
			
			// 🎯 Gemini 권고: DOM 직접 조작 추가
			this.applyColorsToDOM(selectedCells, color);
			
			new Notice(`Applied color to ${cellsChanged} cells`);
			console.log(`✅ Successfully applied color to ${cellsChanged} cells`);
		} else {
			console.log('❌ No valid cells found to apply color');
		}
		
		console.log('=== END MULTI-CELL MODE ===');
	}

	/**
	 * 현재 커서가 위치한 테이블만 대상으로 DOM 직접 조작
	 * 다른 테이블에는 영향을 주지 않도록 개선
	 */
	private applyColorsToDOM(selectedCells: Set<string>, color: string): void {
		console.log('🎨 DOM 직접 조작 시작 - 현재 테이블만 대상');
		
		// 현재 커서 위치의 테이블 정보 가져오기
		const activeEditor = this.app.workspace.activeEditor;
		if (!activeEditor?.editor) {
			console.log('❌ No active editor found for DOM manipulation');
			return;
		}
		
		const editor = activeEditor.editor;
		const cursor = editor.getCursor();
		const content = editor.getValue();
		const currentTable = MarkdownParser.getTableAtCursor(content, cursor.line);
		
		if (!currentTable) {
			console.log('❌ No table found at cursor position for DOM manipulation');
			return;
		}
		
		console.log(`🎯 타겟 테이블 식별됨: 라인 ${currentTable.startLine}-${currentTable.endLine}`);
		
		// 현재 테이블을 정확하게 찾기
		let targetTable: HTMLTableElement | null = null;
		
		// 에디터 컨테이너에서 테이블 찾기
		const editorContainer = document.querySelector('.cm-editor, .markdown-preview-view');
		if (editorContainer) {
			const tablesInEditor = editorContainer.querySelectorAll('table');
			console.log(`📋 에디터 내 테이블 수: ${tablesInEditor.length}`);
			
			if (tablesInEditor.length === 1) {
				// 테이블이 하나뿐이면 그것이 타겟
				targetTable = tablesInEditor[0] as HTMLTableElement;
				console.log(`🎯 단일 테이블 선택됨`);
			} else if (tablesInEditor.length > 1) {
				// 여러 테이블이 있으면 헤더 내용으로 매칭
				const currentHeaders = currentTable.headers.cells.map(cell => cell.content.trim());
				console.log(`🔍 현재 테이블 헤더:`, currentHeaders);
				
				for (let i = 0; i < tablesInEditor.length; i++) {
					const table = tablesInEditor[i] as HTMLTableElement;
					const headerRow = table.querySelector('tr:first-child');
					if (headerRow) {
						const headerCells = headerRow.querySelectorAll('th, td');
						const domHeaders = Array.from(headerCells).map(cell => cell.textContent?.trim() || '');
						console.log(`🔍 DOM 테이블 ${i} 헤더:`, domHeaders);
						
						// 헤더 내용이 일치하는지 확인
						if (domHeaders.length === currentHeaders.length) {
							const isMatch = domHeaders.every((header, idx) => {
								// HTML 태그 제거해서 비교
								const cleanHeader = header.replace(/<[^>]*>/g, '').trim();
								const cleanCurrentHeader = currentHeaders[idx].replace(/<[^>]*>/g, '').trim();
								return cleanHeader === cleanCurrentHeader;
							});
							
							if (isMatch) {
								targetTable = table;
								console.log(`🎯 매칭되는 테이블 찾음: 테이블 ${i}`);
								break;
							}
						}
					}
				}
				
				// 매칭 실패시 첫 번째 테이블을 폴백으로 사용
				if (!targetTable && tablesInEditor.length > 0) {
					targetTable = tablesInEditor[0] as HTMLTableElement;
					console.log(`⚠️  매칭 실패, 첫 번째 테이블을 폴백으로 사용`);
				}
			}
		}
		
		if (!targetTable) {
			console.log('❌ 타겟 테이블을 DOM에서 찾을 수 없음');
			return;
		}
		
		// 선택된 테이블에만 색상 적용
		selectedCells.forEach(cellCoord => {
			if (!targetTable) {
				console.log('❌ targetTable이 null입니다');
				return;
			}
			
			const parts = cellCoord.split(',');
			const rowIndex = parseInt(parts[0], 10);
			const colIndex = parseInt(parts[1], 10);
			const cellType = parts[2] || 'data';
			
			let targetCell: HTMLElement | null = null;
			
			if (cellType === 'header') {
				// 헤더 셀 찾기
				const headerRow = targetTable.querySelector('tr:first-child');
				if (headerRow) {
					const headerCells = headerRow.querySelectorAll('th, td');
					if (colIndex < headerCells.length) {
						targetCell = headerCells[colIndex] as HTMLElement;
						console.log(`🎯 헤더 셀 찾음: 열[${colIndex}]`);
					}
				}
			} else {
				// 데이터 셀 찾기 (첫 번째 행은 헤더이므로 +1)
				// rowIndex는 이미 데이터 행의 0-based 인덱스이므로, DOM에서는 +1만 하면 됨
				const dataRowIndex = rowIndex + 1;
				const rows = targetTable.querySelectorAll('tr');
				if (dataRowIndex < rows.length) {
					const dataCells = rows[dataRowIndex].querySelectorAll('th, td');
					if (colIndex < dataCells.length) {
						targetCell = dataCells[colIndex] as HTMLElement;
						console.log(`🎯 데이터 셀 찾음: 행[${dataRowIndex}] 열[${colIndex}]`);
					}
				}
			}
			
			// DOM에 직접 색상 적용
			if (targetCell) {
				targetCell.style.backgroundColor = color;
				targetCell.style.position = 'relative';
				console.log(`✅ DOM 색상 적용 완료: ${cellType} 셀에 ${color}`);
			} else {
				console.log(`❌ DOM 셀을 찾을 수 없음: ${cellType}[${rowIndex}, ${colIndex}]`);
			}
		});
		
		console.log('🎨 DOM 직접 조작 완료 - 현재 테이블만 처리됨');
	}

	private applyColorToSingleCell(editor: any, color: string): void {
		const cursor = editor.getCursor();
		this.applyColorToSingleCellAtPosition(editor, color, cursor);
	}

	private applyColorToSingleCellAtPosition(editor: any, color: string, cursorPos: any): void {
		console.log('applyColorToSingleCellAtPosition - Using cursor position:', cursorPos);
		
		const content = editor.getValue();
		const table = MarkdownParser.getTableAtCursor(content, cursorPos.line);
		
		if (!table) {
			console.log('No table found at cursor position line:', cursorPos.line);
			new Notice('No table found at cursor position');
			return;
		}

		console.log('Found table at lines:', table.startLine, '-', table.endLine);

		// Get cursor position in table
		const rowIndex = this.getCursorRowIndex(table, cursorPos.line);
		const colIndex = this.getCursorColumnIndex(table, cursorPos);

		console.log('Target cell position - row:', rowIndex, 'col:', colIndex);

		if (rowIndex >= 0 && colIndex >= 0) {
			this.applyCellColor(table.rows[rowIndex].cells[colIndex], color);
			
			// Regenerate and replace table
			this.updateTable(editor, table);
			
			const colorName = color ? 'applied' : 'removed';
			new Notice(`Cell background color ${colorName}`);
		} else {
			console.log('Invalid cell position - row:', rowIndex, 'col:', colIndex);
			new Notice('Could not determine cell position');
		}
	}

	private applyColorToSelection(editor: any, color: string): void {
		console.log('applyColorToSelection called');
		
		const selections = editor.listSelections();
		// Check if there's any meaningful selection (not just cursor position)
		const hasSelection = selections.length > 0 && selections.some((s: any) => 
			s.anchor.line !== s.head.line || s.anchor.ch !== s.head.ch
		);
		
		console.log('Selection info:', {
			selectionsCount: selections.length,
			hasSelection: hasSelection,
		});
		
		if (hasSelection) {
			// Multi-cell selection mode - apply to all selected areas
			this.applyColorToSelectedCells(editor, color, selections);
		} else {
			// No selection in multi-cell mode
			new Notice('Multi-cell mode: Please select one or more cells to apply color.');
		}
	}

	private applyColorToSelectedCells(editor: any, color: string, selections: any[]): void {
		console.log(`=== MULTI-CELL SELECTION DEBUG ===`);
		console.log(`Number of selections: ${selections.length}`);
		
		const content = editor.getValue();
		const cursor = editor.getCursor(); // To locate table position
		
		const table = MarkdownParser.getTableAtCursor(content, cursor.line);
		if (!table) {
			console.log('❌ No table found at cursor position');
			new Notice('No table found at cursor position');
			return;
		}

		console.log(`📋 Table found: lines ${table.startLine}-${table.endLine}, ${table.rows.length} rows, ${table.headers.cells.length} columns`);

		const lines = content.split('\n');
		// Use Set to prevent duplicate cell applications (when multiple selections include same cell)
		const cellsToChange = new Set<string>(); // Store as "rowIndex,colIndex" format

		// Process all selections
		selections.forEach((selection, selectionIndex) => {
			// Determine selection boundaries (normalize to start -> end order)
			const startPos = selection.anchor.line < selection.head.line || 
				(selection.anchor.line === selection.head.line && selection.anchor.ch < selection.head.ch) 
				? selection.anchor : selection.head;
			const endPos = selection.anchor.line < selection.head.line || 
				(selection.anchor.line === selection.head.line && selection.anchor.ch < selection.head.ch) 
				? selection.head : selection.anchor;

			console.log(`🔍 Selection ${selectionIndex + 1}/${selections.length}:`);
			console.log(`   Start: line ${startPos.line}, char ${startPos.ch}`);
			console.log(`   End: line ${endPos.line}, char ${endPos.ch}`);
			console.log(`   Selected text: "${editor.getRange(startPos, endPos)}"`);

			// Process each line in the selection that contains table data
			for (let lineNum = Math.max(startPos.line, table.startLine); lineNum <= Math.min(endPos.line, table.endLine); lineNum++) {
				// Skip header line and separator line
				if (lineNum <= table.startLine + 1) {
					console.log(`   ⏭️  Skipping line ${lineNum} (header/separator)`);
					continue;
				}
				
				const rowIndex = lineNum - table.startLine - 2; // Data rows start at startLine + 2
				if (rowIndex < 0 || rowIndex >= table.rows.length) {
					console.log(`   ❌ Invalid row index ${rowIndex} for line ${lineNum}`);
					continue;
				}

				const lineContent = lines[lineNum] || '';
				if (!lineContent.includes('|')) {
					console.log(`   ❌ Line ${lineNum} is not a table line: "${lineContent}"`);
					continue;
				}

				// Determine character range for this line
				const fromCh = (lineNum === startPos.line) ? startPos.ch : 0;
				const toCh = (lineNum === endPos.line) ? endPos.ch : lineContent.length;

				console.log(`   📏 Line ${lineNum} (row ${rowIndex}): chars ${fromCh}-${toCh}`);
				console.log(`      Content: "${lineContent}"`);

				// Find which cells are selected in this row
				const selectedCellIndices = this.findSelectedCells(lineContent, fromCh, toCh);
				console.log(`   🎯 Selected cells: [${selectedCellIndices.join(', ')}]`);

				// Add selected cells to the set
				selectedCellIndices.forEach(cellIndex => {
					if (cellIndex >= 0 && cellIndex < table.rows[rowIndex].cells.length) {
						const cellCoord = `${rowIndex},${cellIndex}`;
						cellsToChange.add(cellCoord);
						console.log(`   ✅ Adding cell [${rowIndex}][${cellIndex}] to change set`);
					} else {
						console.log(`   ❌ Invalid cell index ${cellIndex} for row ${rowIndex}`);
					}
				});
			}
		});

		console.log(`📊 SUMMARY: ${cellsToChange.size} unique cells to change:`);
		cellsToChange.forEach(cellCoord => {
			const [rowIndex, colIndex] = cellCoord.split(',').map(Number);
			console.log(`   • Cell [${rowIndex}][${colIndex}]`);
		});

		if (cellsToChange.size > 0) {
			// Apply color to all unique cells
			cellsToChange.forEach(cellCoord => {
				const [rowIndex, colIndex] = cellCoord.split(',').map(Number);
				console.log(`🎨 Applying color to cell [${rowIndex}][${colIndex}]`);
				this.applyCellColor(table.rows[rowIndex].cells[colIndex], color);
			});

			// Update the table
			this.updateTable(editor, table);
			
			const colorName = color ? 'applied' : 'removed';
			console.log(`✅ SUCCESS: Cell background color ${colorName} to ${cellsToChange.size} selected cells`);
			new Notice(`Cell background color ${colorName} to ${cellsToChange.size} selected cells`);
		} else {
			console.log('❌ FAILURE: No table cells found in selection');
			new Notice('No table cells found in selection');
		}
		
		console.log(`=== END MULTI-CELL SELECTION DEBUG ===`);
	}

	private applyColorToEntireRow(editor: any, color: string): void {
		console.log('applyColorToEntireRow - applying to entire row (legacy behavior)');
		
		const content = editor.getValue();
		const cursor = editor.getCursor();
		
		const table = MarkdownParser.getTableAtCursor(content, cursor.line);
		if (!table) {
			new Notice('No table found at cursor position');
			return;
		}

		// Get current cell position
		const currentRowIndex = this.getCursorRowIndex(table, cursor.line);
		const currentColIndex = this.getCursorColumnIndex(table, cursor);
		
		console.log('Current cell position:', currentRowIndex, currentColIndex);

		if (currentRowIndex < 0 || currentColIndex < 0) {
			new Notice('Please place cursor in a table cell');
			return;
		}

		// Apply color to entire row containing the cursor
		let totalCellsChanged = 0;
		const targetRow = table.rows[currentRowIndex];
		
		console.log('Applying color to entire row', currentRowIndex);
		
		targetRow.cells.forEach((cell: any, cellIndex: number) => {
			console.log('Coloring cell', cellIndex, 'in row', currentRowIndex);
			this.applyCellColor(cell, color);
			totalCellsChanged++;
		});

		// Update the table
		this.updateTable(editor, table);

		const colorName = color ? 'applied' : 'removed';
		console.log('Total cells changed:', totalCellsChanged);
		new Notice(`Cell background color ${colorName} to ${totalCellsChanged} cells in row ${currentRowIndex + 1}`);
	}

	private findSelectedCells(lineContent: string, fromCh: number, toCh: number): number[] {
		console.log(`findSelectedCells: "${lineContent}" chars ${fromCh}-${toCh}`);
		
		// Find all pipe positions
		const pipePositions: number[] = [];
		for (let i = 0; i < lineContent.length; i++) {
			if (lineContent[i] === '|') {
				pipePositions.push(i);
			}
		}

		console.log('Pipe positions:', pipePositions);

		if (pipePositions.length < 2) {
			console.log('Not enough pipes for a valid table line');
			return [];
		}

		const selectedCells: number[] = [];

		// Check each cell (between consecutive pipes)
		for (let i = 0; i < pipePositions.length - 1; i++) {
			const cellStart = pipePositions[i];
			const cellEnd = pipePositions[i + 1];
			
			console.log(`Checking cell ${i}: pipes at ${cellStart}-${cellEnd}, selection ${fromCh}-${toCh}`);
			
			// Check if selection overlaps with this cell
			const hasOverlap = !(toCh <= cellStart || fromCh >= cellEnd);
			
			if (hasOverlap) {
				console.log(`Cell ${i} is selected`);
				selectedCells.push(i);
			}
		}

		console.log('Selected cells:', selectedCells);
		return selectedCells;
	}

	private applyCellColor(cell: any, color: string): void {
		// Clean the content of any existing styling
		let cleanContent = cell.content.replace(/<td[^>]*style="[^"]*background-color:[^"]*"[^>]*>([^<]*)<\/td>/g, '$1');
		cleanContent = cleanContent.replace(/<span[^>]*style="[^"]*background-color:[^"]*"[^>]*>([^<]*)<\/span>/g, '$1');
		cleanContent = cleanContent.replace(/<mark[^>]*>([^<]*)<\/mark>/g, '$1');
		cleanContent = cleanContent.replace(/<div[^>]*class="cell-bg-[^"]*"[^>]*>([^<]*)<\/div>/g, '$1');
		
		if (color) {
			// Create a unique CSS class for this color and wrap the content
			const colorClass = this.getColorClass(color);
			this.addColorCSS(color, colorClass);
			
			// If content is empty or just whitespace, add a non-breaking space to ensure height
			const contentToWrap = cleanContent.trim() === '' ? '&nbsp;' : cleanContent;
			cell.content = `<div class="${colorClass}">${contentToWrap}</div>`;
		} else {
			cell.content = cleanContent;
		}
	}

	private getColorClass(color: string): string {
		// Create a unique class name based on the color
		const colorHash = color.replace('#', '').replace(/[^a-zA-Z0-9]/g, '');
		return `cell-bg-${colorHash}`;
	}

	private addColorCSS(color: string, className: string): void {
		// Add CSS style to document head if not already present
		const styleId = `table-cell-style-${className}`;
		if (!document.getElementById(styleId)) {
			const style = document.createElement('style');
			style.id = styleId;
			style.textContent = `
				/* 셀 전체에 배경색 적용 - :has() 선택자 사용 */
				table td:has(.${className}), 
				table th:has(.${className}) {
					background-color: ${color} !important;
					padding: 8px !important;
					position: relative !important;
				}
				
				/* div는 투명 배경으로 텍스트 컨테이너 역할만 */
				.${className} {
					background-color: transparent !important;
					display: block !important;
					width: 100% !important;
					padding: 0 !important;
					margin: 0 !important;
					box-sizing: border-box !important;
					border-radius: 0 !important;
				}
				
				/* :has() 미지원 브라우저를 위한 fallback */
				@supports not selector(:has(*)) {
					.${className} {
						position: absolute !important;
						top: 0 !important;
						left: 0 !important;
						right: 0 !important;
						bottom: 0 !important;
						background-color: ${color} !important;
						padding: 8px !important;
						z-index: 1 !important;
					}
					
					table td, table th {
						position: relative !important;
						padding: 8px !important;
					}
				}
				
				/* 헤더 셀 특별 처리 */
				th:has(.${className}) {
					font-weight: bold !important;
					text-align: center !important;
				}
				
				/* 데이터 셀 처리 */
				td:has(.${className}) {
					text-align: left !important;
				}
				
				/* 다크 테마 호환성 */
				.theme-dark table td:has(.${className}), 
				.theme-dark table th:has(.${className}) {
					background-color: ${color} !important;
				}
				
				/* 빈 셀 처리 */
				.${className}:empty::before {
					content: "\\00a0"; /* Non-breaking space */
					visibility: hidden;
				}
			`;
			document.head.appendChild(style);
		}
	}

	private generateHTMLTable(table: any): string {
		// This method is no longer used - keeping Markdown table structure
		return MarkdownParser.generateTable(table);
	}

	

	// Drag and drop functionality
	moveRow(fromIndex: number, toIndex: number): void {
		const activeEditor = this.app.workspace.activeEditor;
		if (!activeEditor?.editor) {
			new Notice('No active editor found');
			return;
		}

		const editor = activeEditor.editor;
		const cursor = editor.getCursor();
		const content = editor.getValue();

		const table = MarkdownParser.getTableAtCursor(content, cursor.line);
		if (!table) {
			new Notice('No table found at cursor position');
			return;
		}

		// Validate indices
		if (fromIndex < 0 || fromIndex >= table.rows.length || toIndex < 0 || toIndex >= table.rows.length) {
			new Notice('Invalid row indices');
			return;
		}

		// Move row
		const row = table.rows.splice(fromIndex, 1)[0];
		table.rows.splice(toIndex, 0, row);

		// Remember the last modified row position
		this.lastModifiedRow = toIndex;

		// Update table
		this.updateTable(editor, table);
		new Notice(`Row moved from ${fromIndex + 1} to ${toIndex + 1}`);
	}

	moveColumn(fromIndex: number, toIndex: number): void {
		const activeEditor = this.app.workspace.activeEditor;
		if (!activeEditor?.editor) {
			new Notice('No active editor found');
			return;
		}

		const editor = activeEditor.editor;
		const cursor = editor.getCursor();
		const content = editor.getValue();

		const table = MarkdownParser.getTableAtCursor(content, cursor.line);
		if (!table) {
			new Notice('No table found at cursor position');
			return;
		}

		// Validate indices
		if (fromIndex < 0 || fromIndex >= table.headers.cells.length || toIndex < 0 || toIndex >= table.headers.cells.length) {
			new Notice('Invalid column indices');
			return;
		}

		// Move header column
		const headerCell = table.headers.cells.splice(fromIndex, 1)[0];
		table.headers.cells.splice(toIndex, 0, headerCell);

		// Move separator column
		const separatorCell = table.separator.splice(fromIndex, 1)[0];
		table.separator.splice(toIndex, 0, separatorCell);

		// Move data columns in all rows
		table.rows.forEach(row => {
			const cell = row.cells.splice(fromIndex, 1)[0];
			row.cells.splice(toIndex, 0, cell);
		});

		// Remember the last modified column position
		this.lastModifiedColumn = toIndex;

		// Update table
		this.updateTable(editor, table);
		new Notice(`Column moved from ${fromIndex + 1} to ${toIndex + 1}`);
	}

	// CSV Import/Export functionality
	exportTableToCSV(): void {
		const activeEditor = this.app.workspace.activeEditor;
		if (!activeEditor?.editor) {
			new Notice('No active editor found');
			return;
		}

		const editor = activeEditor.editor;
		const cursor = editor.getCursor();
		const content = editor.getValue();

		const table = MarkdownParser.getTableAtCursor(content, cursor.line);
		if (!table) {
			new Notice('No table found at cursor position');
			return;
		}

		// Convert table to CSV
		const csvLines: string[] = [];
		
		// Add headers
		const headerCells = table.headers.cells.map(cell => this.escapeCsvCell(cell.content));
		csvLines.push(headerCells.join(','));

		// Add data rows
		table.rows.forEach(row => {
			const rowCells = row.cells.map(cell => this.escapeCsvCell(cell.content));
			csvLines.push(rowCells.join(','));
		});

		const csvContent = csvLines.join('\n');

		// Copy to clipboard
		navigator.clipboard.writeText(csvContent).then(() => {
			new Notice('Table exported to clipboard as CSV');
		}).catch(() => {
			new Notice('Failed to copy CSV to clipboard');
		});
	}

	importTableFromCSV(): void {
		// Create file input to read CSV
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.csv';
		input.style.display = 'none';

		input.addEventListener('change', (event) => {
			const file = (event.target as HTMLInputElement).files?.[0];
			if (!file) return;

			const reader = new FileReader();
			reader.onload = (e) => {
				const csvContent = e.target?.result as string;
				this.convertCSVToTable(csvContent);
			};
			reader.readAsText(file);
		});

		document.body.appendChild(input);
		input.click();
		document.body.removeChild(input);
	}

	private convertCSVToTable(csvContent: string): void {
		const activeEditor = this.app.workspace.activeEditor;
		if (!activeEditor?.editor) {
			new Notice('No active editor found');
			return;
		}

		// Parse CSV content
		const lines = csvContent.trim().split('\n');
		if (lines.length < 2) {
			new Notice('CSV must have at least a header and one data row');
			return;
		}

		// Parse CSV lines
		const parsedRows = lines.map(line => this.parseCSVLine(line));
		const headers = parsedRows[0];
		const dataRows = parsedRows.slice(1);

		// Create markdown table
		const table = this.createMarkdownTableFromData(headers, dataRows);
		
		// Insert at cursor position
		const cursor = activeEditor.editor.getCursor();
		activeEditor.editor.replaceRange(table, cursor);
		
		new Notice(`CSV imported: ${headers.length} columns, ${dataRows.length} rows`);
	}

	private parseCSVLine(line: string): string[] {
		const cells: string[] = [];
		let currentCell = '';
		let inQuotes = false;
		let i = 0;

		while (i < line.length) {
			const char = line[i];
			
			if (char === '"') {
				if (inQuotes && line[i + 1] === '"') {
					// Escaped quote
					currentCell += '"';
					i += 2;
				} else {
					// Toggle quote state
					inQuotes = !inQuotes;
					i++;
				}
			} else if (char === ',' && !inQuotes) {
				// End of cell
				cells.push(currentCell.trim());
				currentCell = '';
				i++;
			} else {
				currentCell += char;
				i++;
			}
		}
		
		// Add last cell
		cells.push(currentCell.trim());
		return cells;
	}

	private escapeCsvCell(content: string): string {
		// Remove HTML tags for export
		const cleanContent = content.replace(/<[^>]*>/g, '');
		
		// Escape quotes and wrap in quotes if necessary
		if (cleanContent.includes(',') || cleanContent.includes('"') || cleanContent.includes('\n')) {
			return `"${cleanContent.replace(/"/g, '""')}"`;
		}
		return cleanContent;
	}

	private createMarkdownTableFromData(headers: string[], dataRows: string[][]): string {
		const tableLines: string[] = [];
		
		// Create header line
		const headerLine = '| ' + headers.join(' | ') + ' |';
		tableLines.push(headerLine);
		
		// Create separator line
		const separatorLine = '| ' + headers.map(() => '---').join(' | ') + ' |';
		tableLines.push(separatorLine);
		
		// Create data rows
		dataRows.forEach(row => {
			const rowLine = '| ' + row.join(' | ') + ' |';
			tableLines.push(rowLine);
		});
		
		return tableLines.join('\n') + '\n';
	}

	validateCurrentTable(): void {
		const activeEditor = this.app.workspace.activeEditor;
		if (!activeEditor?.editor) {
			new Notice('No active editor found');
			return;
		}

		const editor = activeEditor.editor;
		const cursor = editor.getCursor();
		const content = editor.getValue();

		const table = MarkdownParser.getTableAtCursor(content, cursor.line);
		if (!table) {
			new Notice('No table found at cursor position');
			return;
		}

		const validation = TableValidator.validateTable(table);
		
		if (validation.isValid) {
			new Notice('✅ Table is valid');
		} else {
			new Notice('❌ Table has errors: ' + validation.errors.join(', '));
		}

		if (validation.warnings.length > 0) {
			new Notice('⚠️ Warnings: ' + validation.warnings.join(', '));
		}
	}

	/**
	 * Extract all color classes from the current document
	 * Used for regenerating CSS after plugin restart
	 */
	private async extractColorClassesFromDocument(): Promise<Set<string>> {
		const colorClasses = new Set<string>();
		
		// Get all files in the vault
		const files = this.app.vault.getMarkdownFiles();
		console.log(`Scanning ${files.length} markdown files for color classes...`);
		
		// Process files in batches to avoid overwhelming the system
		const batchSize = 10;
		for (let i = 0; i < files.length; i += batchSize) {
			const batch = files.slice(i, i + batchSize);
			
			const promises = batch.map(async (file) => {
				try {
					const content = await this.app.vault.cachedRead(file);
					// Find all cell-bg-* classes in the content
					const classRegex = /class="(cell-bg-[^"]+)"/g;
					let match;
					while ((match = classRegex.exec(content)) !== null) {
						colorClasses.add(match[1]);
						console.log(`Found color class: ${match[1]} in file: ${file.path}`);
					}
				} catch (error) {
					console.error(`Error reading file ${file.path}:`, error);
				}
			});
			
			await Promise.all(promises);
		}
		
		console.log(`Total unique color classes found: ${colorClasses.size}`);
		return colorClasses;
	}

	/**
	 * Extract color from class name
	 * Converts cell-bg-f3f4f6 -> #f3f4f6
	 */
	private extractColorFromClassName(className: string): string {
		const colorHash = className.replace('cell-bg-', '');
		
		// Try to reconstruct the original color
		if (colorHash.length === 6 && /^[0-9a-fA-F]+$/.test(colorHash)) {
			// Hex color
			return `#${colorHash}`;
		} else if (colorHash.includes('hsl')) {
			// HSL color pattern (simplified reconstruction)
			// This is a basic implementation - may need enhancement
			return colorHash;
		} else {
			// Other color formats or unknown - return as is
			console.warn(`Unknown color format in class: ${className}`);
			return colorHash;
		}
	}

	/**
	 * Regenerate all color CSS styles after plugin restart
	 * This ensures that existing colored cells remain visible
	 */
	public async regenerateColorCSS(): Promise<void> {
		console.log('🎨 Starting CSS regeneration after plugin restart');
		
		try {
			// Wait a bit for Obsidian to fully initialize
			await new Promise(resolve => setTimeout(resolve, 1000));
			
			// Extract all color classes from all markdown files
			const colorClasses = await this.extractColorClassesFromDocument();
			
			console.log(`Found ${colorClasses.size} unique color classes to regenerate`);
			
			if (colorClasses.size === 0) {
				console.log('No color classes found - trying current document only');
				
				// Fallback: scan current document if no files found in vault scan
				const currentColors = this.scanCurrentDocumentForColors();
				if (currentColors.size > 0) {
					console.log(`Found ${currentColors.size} color classes in current document`);
					currentColors.forEach(className => {
						try {
							const color = this.extractColorFromClassName(className);
							console.log(`Regenerating CSS for class: ${className} -> color: ${color}`);
							this.addColorCSS(color, className);
						} catch (error) {
							console.error(`Error regenerating CSS for class ${className}:`, error);
						}
					});
					console.log('✅ CSS regeneration completed from current document');
					return;
				}
				
				console.log('No color classes found - skipping CSS regeneration');
				return;
			}

			// Regenerate CSS for each found color class
			colorClasses.forEach(className => {
				try {
					const color = this.extractColorFromClassName(className);
					console.log(`Regenerating CSS for class: ${className} -> color: ${color}`);
					
					// Use existing addColorCSS method to regenerate the style
					this.addColorCSS(color, className);
					
				} catch (error) {
					console.error(`Error regenerating CSS for class ${className}:`, error);
				}
			});
			
			console.log('✅ CSS regeneration completed successfully');
			
		} catch (error) {
			console.error('❌ Error during CSS regeneration:', error);
		}
	}

	/**
	 * Clean up all dynamically generated CSS styles
	 * Called during plugin unload to prevent memory leaks
	 */
	public cleanupColorCSS(): void {
		console.log('🧹 Cleaning up dynamically generated CSS styles');
		
		try {
			// Find all style elements created by this plugin
			const pluginStyles = document.querySelectorAll('style[id^="table-cell-style-cell-bg-"]');
			
			console.log(`Found ${pluginStyles.length} plugin-generated style elements to remove`);
			
			pluginStyles.forEach(style => {
				const styleId = style.id;
				console.log(`Removing style element: ${styleId}`);
				style.remove();
			});
			
			console.log('✅ CSS cleanup completed successfully');
			
		} catch (error) {
			console.error('❌ Error during CSS cleanup:', error);
		}
	}

	/**
	 * Utility method to scan current active document for color classes
	 * Used for real-time color detection
	 */
	public scanCurrentDocumentForColors(): Set<string> {
		const activeEditor = this.app.workspace.activeEditor;
		if (!activeEditor?.editor) {
			console.log('No active editor for color scanning');
			return new Set();
		}
		
		const content = activeEditor.editor.getValue();
		const colorClasses = new Set<string>();
		
		// Find all cell-bg-* classes in current document
		const classRegex = /class="(cell-bg-[^"]+)"/g;
		let match;
		while ((match = classRegex.exec(content)) !== null) {
			colorClasses.add(match[1]);
		}
		
		console.log(`Found ${colorClasses.size} color classes in current document`);
		return colorClasses;
	}

	/**
	 * Initialize event listeners for automatic CSS regeneration
	 * Called from main.ts after plugin initialization
	 */
	public initializeColorCSSEvents(): void {
		console.log('🔗 Setting up color CSS event listeners');
		
		// Regenerate CSS when files are opened
		this.app.workspace.on('file-open', (file) => {
			if (file && file.extension === 'md') {
				console.log(`📂 File opened: ${file.path} - checking for color classes`);
				setTimeout(() => {
					this.regenerateColorCSSForCurrentFile();
				}, 500); // Small delay to ensure file content is loaded
			}
		});

		// Regenerate CSS when switching between tabs
		this.app.workspace.on('active-leaf-change', () => {
			console.log('🔄 Active leaf changed - checking for color classes');
			setTimeout(() => {
				this.regenerateColorCSSForCurrentFile();
			}, 200);
		});
		
		console.log('✅ Color CSS event listeners initialized');
	}

	/**
	 * Regenerate CSS for current file only (faster than full vault scan)
	 */
	private regenerateColorCSSForCurrentFile(): void {
		const activeEditor = this.app.workspace.activeEditor;
		if (!activeEditor?.editor) {
			return;
		}
		
		const content = activeEditor.editor.getValue();
		if (!content.includes('cell-bg-')) {
			return; // No color classes in current file
		}
		
		console.log('🎨 Regenerating CSS for current file');
		const colorClasses = new Set<string>();
		
		// Find all cell-bg-* classes in current file
		const classRegex = /class="(cell-bg-[^"]+)"/g;
		let match;
		while ((match = classRegex.exec(content)) !== null) {
			colorClasses.add(match[1]);
		}
		
		console.log(`Found ${colorClasses.size} color classes in current file`);
		
		// Regenerate CSS for found classes
		colorClasses.forEach(className => {
			try {
				const color = this.extractColorFromClassName(className);
				console.log(`Regenerating CSS: ${className} -> ${color}`);
				this.addColorCSS(color, className);
			} catch (error) {
				console.error(`Error regenerating CSS for ${className}:`, error);
			}
		});
		
		if (colorClasses.size > 0) {
			console.log('✅ Current file CSS regeneration completed');
		}
	}
}