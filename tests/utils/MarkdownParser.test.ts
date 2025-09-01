import { MarkdownParser, ParsedTable } from '../../src/utils/MarkdownParser';

describe('MarkdownParser', () => {
	describe('generateTable', () => {
		it('should generate table from headers and rows', () => {
			const headers = ['Name', 'Age', 'City'];
			const rows = [
				['John', '25', 'New York'],
				['Jane', '30', 'London']
			];

			const result = MarkdownParser.generateTable(headers, rows);
			const expected = [
				'| Name | Age | City |',
				'| --- | --- | --- |',
				'| John | 25 | New York |',
				'| Jane | 30 | London |'
			].join('\n');

			expect(result).toBe(expected);
		});

		it('should generate table with alignment', () => {
			const headers = ['Left', 'Center', 'Right'];
			const rows = [['A', 'B', 'C']];
			const alignments: ('left' | 'center' | 'right')[] = ['left', 'center', 'right'];

			const result = MarkdownParser.generateTable(headers, rows, alignments);
			const expected = [
				'| Left | Center | Right |',
				'| --- | :---: | ---: |',
				'| A | B | C |'
			].join('\n');

			expect(result).toBe(expected);
		});

		it('should generate table from ParsedTable object', () => {
			const table: ParsedTable = {
				headers: { cells: [{ content: 'Name' }, { content: 'Age' }] },
				separator: ['---', '---'],
				rows: [
					{ cells: [{ content: 'John' }, { content: '25' }] },
					{ cells: [{ content: 'Jane' }, { content: '30' }] }
				],
				startLine: 0,
				endLine: 3
			};

			const result = MarkdownParser.generateTable(table);
			const expected = [
				'| Name | Age |',
				'| --- | --- |',
				'| John | 25 |',
				'| Jane | 30 |'
			].join('\n');

			expect(result).toBe(expected);
		});
	});

	describe('createEmptyTable', () => {
		it('should create empty table with specified dimensions', () => {
			const result = MarkdownParser.createEmptyTable(2, 3);
			const expected = [
				'| Header 1 | Header 2 | Header 3 |',
				'| --- | --- | --- |',
				'|  |  |  |',
				'|  |  |  |'
			].join('\n');

			expect(result).toBe(expected);
		});
	});

	describe('getTableAtCursor', () => {
		it('should find table at cursor position', () => {
			const content = [
				'Some text',
				'| Name | Age |',
				'| --- | --- |',
				'| John | 25 |',
				'| Jane | 30 |',
				'More text'
			].join('\n');

			const table = MarkdownParser.getTableAtCursor(content, 2);
			expect(table).not.toBeNull();
			expect(table!.headers.cells).toHaveLength(2);
			expect(table!.headers.cells[0].content).toBe('Name');
			expect(table!.headers.cells[1].content).toBe('Age');
			expect(table!.rows).toHaveLength(2);
		});

		it('should return null when no table found', () => {
			const content = [
				'Some text',
				'No table here',
				'More text'
			].join('\n');

			const table = MarkdownParser.getTableAtCursor(content, 1);
			expect(table).toBeNull();
		});
	});
});