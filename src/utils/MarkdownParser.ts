export interface TableCell {
	content: string;
	alignment?: 'left' | 'center' | 'right';
}

export interface TableRow {
	cells: TableCell[];
}

export interface ParsedTable {
	headers: TableRow;
	separator: string[];
	rows: TableRow[];
	startLine: number;
	endLine: number;
}

export class MarkdownParser {
	static parseTable(content: string, startLine: number = 0): ParsedTable | null {
		const lines = content.split('\n');
		let currentLine = startLine;
		
		// Find table start
		while (currentLine < lines.length && !this.isTableLine(lines[currentLine])) {
			currentLine++;
		}
		
		if (currentLine >= lines.length) {
			return null;
		}
		
		const tableStartLine = currentLine;
		
		// Parse header
		const headerLine = lines[currentLine];
		const headers = this.parseTableRow(headerLine);
		currentLine++;
		
		// Parse separator
		if (currentLine >= lines.length || !this.isSeparatorLine(lines[currentLine])) {
			return null;
		}
		
		const separatorLine = lines[currentLine];
		const separator = this.parseSeparator(separatorLine);
		currentLine++;
		
		// Parse rows
		const rows: TableRow[] = [];
		while (currentLine < lines.length && this.isTableLine(lines[currentLine])) {
			const row = this.parseTableRow(lines[currentLine]);
			rows.push(row);
			currentLine++;
		}
		
		return {
			headers,
			separator,
			rows,
			startLine: tableStartLine,
			endLine: currentLine - 1
		};
	}
	
	
	static generateTable(table: ParsedTable): string;
	static generateTable(headers: string[], rows: string[][], alignments?: ('left' | 'center' | 'right')[]): string;
	static generateTable(tableOrHeaders: ParsedTable | string[], rows?: string[][], alignments?: ('left' | 'center' | 'right')[]): string {
		if (Array.isArray(tableOrHeaders)) {
			// Legacy signature: generateTable(headers, rows, alignments)
			const headers = tableOrHeaders;
			const tableRows = rows || [];
			
			const lines: string[] = [];
			
			// Add header
			lines.push('| ' + headers.join(' | ') + ' |');
			
			// Add separator with alignment support
			const separator = '| ' + headers.map((_, index) => {
				const align = alignments?.[index] || 'left';
				switch (align) {
					case 'center':
						return ':---:';
					case 'right':
						return '---:';
					default:
						return '---';
				}
			}).join(' | ') + ' |';
			lines.push(separator);
			
			// Add rows
			tableRows.forEach(row => {
				const paddedRow = [...row];
				// Pad row to match header length
				while (paddedRow.length < headers.length) {
					paddedRow.push('');
				}
				lines.push('| ' + paddedRow.slice(0, headers.length).join(' | ') + ' |');
			});
			
			return lines.join('\n');
		} else {
			// New signature: generateTable(table)
			const table = tableOrHeaders;
			const lines: string[] = [];
			
			// Add header
			const headerLine = '| ' + table.headers.cells.map(cell => cell.content).join(' | ') + ' |';
			lines.push(headerLine);
			
			// Add separator
			const separatorLine = '| ' + table.separator.join(' | ') + ' |';
			lines.push(separatorLine);
			
			// Add rows
			table.rows.forEach(row => {
				const rowLine = '| ' + row.cells.map(cell => cell.content).join(' | ') + ' |';
				lines.push(rowLine);
			});
			
			return lines.join('\n');
		}
	}

	static createEmptyTable(rows: number, cols: number): string {
		const headers = Array.from({ length: cols }, (_, i) => `Header ${i + 1}`);
		const tableRows = Array.from({ length: rows }, () => 
			Array.from({ length: cols }, () => '')
		);
		
		return this.generateTable(headers, tableRows);
	}
	
	private static isTableLine(line: string): boolean {
		return line.trim().startsWith('|') && line.trim().endsWith('|');
	}
	
	private static isSeparatorLine(line: string): boolean {
		const trimmed = line.trim();
		return trimmed.startsWith('|') && 
			   trimmed.endsWith('|') && 
			   /^[\|\s\-:]+$/.test(trimmed);
	}
	
	private static parseTableRow(line: string): TableRow {
		const trimmed = line.trim();
		const content = trimmed.slice(1, -1); // Remove surrounding |
		const cells = content.split('|').map(cell => ({
			content: cell.trim()
		}));
		
		return { cells };
	}
	
	private static parseSeparator(line: string): string[] {
		const trimmed = line.trim();
		const content = trimmed.slice(1, -1); // Remove surrounding |
		return content.split('|').map(sep => sep.trim());
	}
	
	static getTableAtCursor(content: string, cursorLine: number): ParsedTable | null {
		const lines = content.split('\n');
		
		// Look backwards for table start
		let startLine = cursorLine;
		while (startLine > 0 && this.isTableLine(lines[startLine])) {
			startLine--;
		}
		
		// If we're not on a table line, look forward
		if (!this.isTableLine(lines[startLine])) {
			startLine++;
		}
		
		// Check if we found a table
		if (startLine >= lines.length || !this.isTableLine(lines[startLine])) {
			return null;
		}
		
		return this.parseTable(content, startLine);
	}
}