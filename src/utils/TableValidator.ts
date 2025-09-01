import { ParsedTable } from './MarkdownParser';

export interface ValidationResult {
	isValid: boolean;
	errors: string[];
	warnings: string[];
}

export class TableValidator {
	static validateTable(table: ParsedTable): ValidationResult {
		const result: ValidationResult = {
			isValid: true,
			errors: [],
			warnings: []
		};
		
		// Check if table has headers
		if (!table.headers || table.headers.cells.length === 0) {
			result.errors.push('Table must have headers');
			result.isValid = false;
		}
		
		// Check if separator matches headers
		if (table.separator.length !== table.headers.cells.length) {
			result.errors.push('Separator row must match number of headers');
			result.isValid = false;
		}
		
		// Check row consistency
		const expectedColumns = table.headers.cells.length;
		table.rows.forEach((row, index) => {
			if (row.cells.length !== expectedColumns) {
				result.warnings.push(`Row ${index + 1} has ${row.cells.length} columns, expected ${expectedColumns}`);
			}
		});
		
		// Check for empty headers
		table.headers.cells.forEach((cell, index) => {
			if (!cell.content.trim()) {
				result.warnings.push(`Header ${index + 1} is empty`);
			}
		});
		
		// Check separator format
		table.separator.forEach((sep, index) => {
			if (!/^:?-+:?$/.test(sep)) {
				result.errors.push(`Invalid separator format in column ${index + 1}: ${sep}`);
				result.isValid = false;
			}
		});
		
		return result;
	}
	
	static validateTableData(headers: string[], rows: string[][]): ValidationResult {
		const result: ValidationResult = {
			isValid: true,
			errors: [],
			warnings: []
		};
		
		// Check headers
		if (!headers || headers.length === 0) {
			result.errors.push('Table must have at least one header');
			result.isValid = false;
		}
		
		// Check for duplicate headers
		const headerSet = new Set();
		headers.forEach((header, index) => {
			if (headerSet.has(header.trim().toLowerCase())) {
				result.warnings.push(`Duplicate header found: "${header}"`);
			}
			headerSet.add(header.trim().toLowerCase());
			
			if (!header.trim()) {
				result.warnings.push(`Header ${index + 1} is empty`);
			}
		});
		
		// Check rows
		if (!rows) {
			result.warnings.push('Table has no data rows');
			return result;
		}
		
		const expectedColumns = headers.length;
		rows.forEach((row, rowIndex) => {
			if (!Array.isArray(row)) {
				result.errors.push(`Row ${rowIndex + 1} is not a valid array`);
				result.isValid = false;
				return;
			}
			
			if (row.length > expectedColumns) {
				result.warnings.push(`Row ${rowIndex + 1} has ${row.length} columns, expected ${expectedColumns}. Extra columns will be ignored.`);
			} else if (row.length < expectedColumns) {
				result.warnings.push(`Row ${rowIndex + 1} has ${row.length} columns, expected ${expectedColumns}. Missing columns will be filled with empty cells.`);
			}
		});
		
		return result;
	}
	
	static sanitizeTableData(headers: string[], rows: string[][]): { headers: string[], rows: string[][] } {
		// Sanitize headers
		const sanitizedHeaders = headers.map(header => 
			header.replace(/\|/g, '\\|').trim() || 'Header'
		);
		
		// Sanitize rows
		const sanitizedRows = rows.map(row => {
			const sanitizedRow = row.map(cell => 
				cell.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim()
			);
			
			// Pad or trim row to match headers length
			while (sanitizedRow.length < sanitizedHeaders.length) {
				sanitizedRow.push('');
			}
			
			return sanitizedRow.slice(0, sanitizedHeaders.length);
		});
		
		return {
			headers: sanitizedHeaders,
			rows: sanitizedRows
		};
	}
	
	static isValidTablePosition(content: string, line: number): boolean {
		const lines = content.split('\n');
		
		if (line < 0 || line >= lines.length) {
			return false;
		}
		
		// Check if current line is part of a table
		const currentLine = lines[line].trim();
		return currentLine.startsWith('|') && currentLine.endsWith('|');
	}
	
	static findTableBoundaries(content: string, cursorLine: number): { start: number, end: number } | null {
		const lines = content.split('\n');
		
		if (!this.isValidTablePosition(content, cursorLine)) {
			return null;
		}
		
		// Find start
		let start = cursorLine;
		while (start > 0 && this.isTableLine(lines[start - 1])) {
			start--;
		}
		
		// Find end
		let end = cursorLine;
		while (end < lines.length - 1 && this.isTableLine(lines[end + 1])) {
			end++;
		}
		
		return { start, end };
	}
	
	private static isTableLine(line: string): boolean {
		const trimmed = line.trim();
		return trimmed.startsWith('|') && trimmed.endsWith('|');
	}
}