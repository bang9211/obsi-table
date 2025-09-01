import { App, Notice, Modal } from 'obsidian';
import { TableManager } from '../managers/TableManager';
import { MarkdownParser } from '../utils/MarkdownParser';
import { TableManagerSettings } from '../settings';

interface CellPosition {
	row: number;
	col: number;
	type: 'header' | 'data';
}

export class TableToolbar {
	app: App;
	tableManager: TableManager;
	settings: TableManagerSettings;
	toolbarElement: HTMLElement | null = null;
	isVisible: boolean = false;
	private sortButton: HTMLElement | null = null;
	private shiftKeyPressed: boolean = false;
	
	// Multi-cell selection tracking
	private isDragging: boolean = false;
	private dragStartCell: CellPosition | null = null;
	private selectedCells: Set<string> = new Set(); // "rowIndex,colIndex,type" format

	constructor(app: App, tableManager: TableManager, settings: TableManagerSettings) {
		this.app = app;
		this.tableManager = tableManager;
		this.settings = settings;
		
		// Add global keyboard event listeners to track Shift key
		document.addEventListener('keydown', (e) => {
			if (e.key === 'Shift') {
				this.shiftKeyPressed = true;
				console.log('>>> GLOBAL Shift key DOWN - shiftKeyPressed:', this.shiftKeyPressed);
			}
		});
		
		document.addEventListener('keyup', (e) => {
			if (e.key === 'Shift') {
				this.shiftKeyPressed = false;
				console.log('>>> GLOBAL Shift key UP - shiftKeyPressed:', this.shiftKeyPressed);
			}
		});
		
		// Add custom cell selection tracking
		this.setupCustomCellSelection();
	}

	createToolbar(): HTMLElement {
		const toolbar = document.createElement('div');
		toolbar.className = 'tableToolbarTinyAesthetic';
		toolbar.id = 'tableToolbarModalBar';
		toolbar.style.visibility = 'hidden';
		toolbar.style.display = 'none';

		// Create table group
		this.addTableCreatorButton(toolbar);
		this.addSeparator(toolbar);

		// Insert group
		this.addButton(toolbar, 'Insert Row', 'table-row-insert', () => {
			this.tableManager.insertRowAtCursor();
		});
		this.addButton(toolbar, 'Insert Column', 'table-column-insert', () => {
			this.tableManager.insertColumnAtCursor();
		});
		this.addSeparator(toolbar);

		// Delete group
		this.addButton(toolbar, 'Delete Row', 'table-row-delete', () => {
			this.tableManager.deleteRowAtCursor();
		});
		this.addButton(toolbar, 'Delete Column', 'table-column-delete', () => {
			this.tableManager.deleteColumnAtCursor();
		});
		this.addSeparator(toolbar);

		// Move group
		this.addMoveButtons(toolbar);
		this.addSeparator(toolbar);

		// Format group
		this.sortButton = this.addSortButton(toolbar);
		this.addColorButton(toolbar);
		this.addSeparator(toolbar);

		// CSV group
		this.addCSVButtons(toolbar);

		return toolbar;
	}

	private addButton(toolbar: HTMLElement, ariaLabel: string, iconName: string, onClick: () => void): void {
		const button = document.createElement('button');
		button.className = 'tableToolbarCommandItem';
		button.setAttribute('aria-label', ariaLabel);

		// Create SVG icon
		const svg = this.createIcon(iconName);
		button.appendChild(svg);

		button.addEventListener('click', onClick);
		toolbar.appendChild(button);
	}

	private addSeparator(toolbar: HTMLElement): void {
		const separator = document.createElement('div');
		separator.className = 'tableToolbarSeparator';
		toolbar.appendChild(separator);
	}

	private addMoveButtons(toolbar: HTMLElement): void {
		// Move row up
		this.addButton(toolbar, 'Move Row Up', 'move-row-up', () => {
			this.promptMoveRow(-1);
		});

		// Move row down
		this.addButton(toolbar, 'Move Row Down', 'move-row-down', () => {
			this.promptMoveRow(1);
		});

		// Move column left
		this.addButton(toolbar, 'Move Column Left', 'move-column-left', () => {
			this.promptMoveColumn(-1);
		});

		// Move column right
		this.addButton(toolbar, 'Move Column Right', 'move-column-right', () => {
			this.promptMoveColumn(1);
		});
	}

	private promptMoveRow(direction: number): void {
		const activeEditor = this.app.workspace.activeEditor;
		if (!activeEditor?.editor) return;

		const editor = activeEditor.editor;
		const cursor = editor.getCursor();
		const content = editor.getValue();
		const table = MarkdownParser.getTableAtCursor(content, cursor.line);
		
		if (!table) return;

		// Use last modified row if available, otherwise use cursor position
		let rowIndex = this.tableManager.lastModifiedRowIndex;
		if (rowIndex === -1 || rowIndex >= table.rows.length) {
			rowIndex = this.getCurrentRowIndex(table, cursor.line);
		}
		
		if (rowIndex === -1) return;

		const newIndex = rowIndex + direction;
		if (newIndex >= 0 && newIndex < table.rows.length) {
			this.tableManager.moveRow(rowIndex, newIndex);
		}
	}

	private promptMoveColumn(direction: number): void {
		const activeEditor = this.app.workspace.activeEditor;
		if (!activeEditor?.editor) return;

		const editor = activeEditor.editor;
		const cursor = editor.getCursor();
		const content = editor.getValue();
		const table = MarkdownParser.getTableAtCursor(content, cursor.line);
		
		if (!table) return;

		// Use last modified column if available, otherwise use cursor position
		let colIndex = this.tableManager.lastModifiedColumnIndex;
		if (colIndex === -1 || colIndex >= table.headers.cells.length) {
			colIndex = this.getCurrentColumnIndex(table, cursor);
		}
		
		if (colIndex === -1) return;

		const newIndex = colIndex + direction;
		if (newIndex >= 0 && newIndex < table.headers.cells.length) {
			this.tableManager.moveColumn(colIndex, newIndex);
		}
	}

	private getCurrentRowIndex(table: any, cursorLine: number): number {
		// Calculate which row the cursor is in
		const relativeLineIndex = cursorLine - table.startLine - 2; // Skip header and separator
		return Math.max(0, Math.min(relativeLineIndex, table.rows.length - 1));
	}

	private getCurrentColumnIndex(table: any, cursor: any): number {
		// Calculate column index based on cursor position
		const activeEditor = this.app.workspace.activeEditor;
		if (!activeEditor?.editor) return -1;
		
		const content = activeEditor.editor.getValue();
		const lines = content.split('\n');
		
		// Use cursor line or header line for column calculation
		let targetLine = '';
		if (cursor.line >= table.startLine && cursor.line <= table.endLine) {
			targetLine = lines[cursor.line] || '';
		} else {
			targetLine = lines[table.startLine] || '';
		}
		
		// Count pipes before cursor position to determine column
		let columnIndex = 0;
		for (let i = 0; i < Math.min(cursor.ch, targetLine.length); i++) {
			if (targetLine[i] === '|') {
				columnIndex++;
			}
		}
		
		// Adjust for table structure (first column is index 0)
		columnIndex = Math.max(0, columnIndex - 1);
		
		// Ensure we don't exceed available columns
		return (columnIndex >= 0 && columnIndex < table.headers.cells.length) ? columnIndex : -1;
	}

	private addCSVButtons(toolbar: HTMLElement): void {
		// Import CSV button
		this.addButton(toolbar, 'Import from CSV', 'csv-import', () => {
			this.tableManager.importTableFromCSV();
		});

		// Export CSV button
		this.addButton(toolbar, 'Export to CSV', 'csv-export', () => {
			this.tableManager.exportTableToCSV();
		});
	}

	private addSortButton(toolbar: HTMLElement): HTMLElement {
	const button = document.createElement('button');
	button.className = 'tableToolbarCommandItem';
	button.setAttribute('aria-label', 'Sort Table (Ascending)');

	// Create SVG icon
	const svg = this.createIcon('table-sort');
	button.appendChild(svg);

	button.addEventListener('click', () => {
		// Don't specify column - let TableManager determine which column to sort
		// This allows it to use cursor position first, then fall back to lastSortedColumn
		this.tableManager.sortTable();
		
		// Update button state after sorting
		this.updateSortButtonState(button);
	});

	toolbar.appendChild(button);
	return button;
}

	private updateSortButtonState(button: HTMLElement): void {
		const isAscending = this.tableManager.isSortAscending;
		const label = isAscending ? 'Sort Table (Ascending)' : 'Sort Table (Descending)';
		button.setAttribute('aria-label', label);
		
		// Add visual indicator for sort direction
		if (isAscending) {
			button.classList.remove('sort-descending');
			button.classList.add('sort-ascending');
		} else {
			button.classList.remove('sort-ascending');
			button.classList.add('sort-descending');
		}
	}

	// Public method to update sort button state from external calls
	public refreshSortButtonState(): void {
		if (this.sortButton) {
			this.updateSortButtonState(this.sortButton);
		}
	}

	private addColorButton(toolbar: HTMLElement): void {
		const container = document.createElement('div');
		container.style.cssText = `
			position: relative;
			display: inline-block;
		`;

		const button = document.createElement('button');
		button.className = 'tableToolbarCommandItem';
		button.setAttribute('aria-label', 'Cell Background Color');

		// Create SVG icon
		const svg = this.createIcon('color-fill');
		button.appendChild(svg);

		let colorPicker: HTMLElement | null = null;
		let hideTimeout: NodeJS.Timeout | null = null;

		const showPicker = () => {
			if (colorPicker) return;

			colorPicker = this.createColorPicker();
			document.body.appendChild(colorPicker);

			// Position relative to button
			const buttonRect = button.getBoundingClientRect();
			colorPicker.style.position = 'fixed';
			colorPicker.style.top = `${buttonRect.bottom + 5}px`;
			colorPicker.style.left = `${buttonRect.left}px`;
			colorPicker.style.display = 'block';
			colorPicker.style.zIndex = '999999';

			// Add event listeners to picker for proper closing
			colorPicker.addEventListener('mouseenter', () => {
				if (hideTimeout) {
					clearTimeout(hideTimeout);
					hideTimeout = null;
				}
			});

			colorPicker.addEventListener('mouseleave', () => {
				hideTimeout = setTimeout(hidePicker, 100);
			});
		};

		const hidePicker = () => {
			if (colorPicker) {
				colorPicker.remove();
				colorPicker = null;
			}
			if (hideTimeout) {
				clearTimeout(hideTimeout);
				hideTimeout = null;
			}
		};

		// Show on hover - but only if button is not disabled
		container.addEventListener('mouseenter', () => {
			// Check if button is disabled
			if (button.classList.contains('disabled')) {
				return; // Don't show picker if button is disabled
			}
			
			if (hideTimeout) {
				clearTimeout(hideTimeout);
				hideTimeout = null;
			}
			showPicker();
		});

		// Hide with delay on mouse leave
		container.addEventListener('mouseleave', () => {
			hideTimeout = setTimeout(hidePicker, 200);
		});

		// Close picker when clicking elsewhere
		document.addEventListener('click', (e) => {
			if (colorPicker && !colorPicker.contains(e.target as Node) && !container.contains(e.target as Node)) {
				hidePicker();
			}
		});

		container.appendChild(button);
		toolbar.appendChild(container);
	}

	private openColorPickerModal(): void {
		// This method is no longer used
	}

	private createColorPicker(): HTMLElement {
		console.log('=== createColorPicker START ===');
		const picker = document.createElement('div');
		picker.className = 'tableToolbarColorPicker';
		
		picker.style.cssText = `
			background: var(--background-primary);
			border: 1px solid var(--background-modifier-border);
			border-radius: 8px;
			padding: 16px;
			box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
			display: block;
			width: 320px;
			max-height: 500px;
			overflow: hidden;
			box-sizing: border-box;
		`;

		// Mode toggle removed - auto-detection based on selection

		console.log('=== Calling addPresetColors ===');
		// Create color sections
		this.addPresetColors(picker);
		
		console.log('=== Calling addColorSpectrum ===');
		this.addColorSpectrum(picker);

		console.log('=== createColorPicker END - picker children count:', picker.children.length, '===');
		return picker;
	}


	private addPresetColors(picker: HTMLElement): void {
		console.log('=== addPresetColors START ===');
		
		const colorSections = [
			{
				name: 'Standard Colors',
				colors: [
					{ name: 'None', value: '', color: 'transparent' },
					{ name: 'Dark Gray', value: '#374151', color: '#374151' },
					{ name: 'Red', value: '#ef4444', color: '#ef4444' },
					{ name: 'Orange', value: '#f97316', color: '#f97316' },
					{ name: 'Yellow', value: '#eab308', color: '#eab308' },
					{ name: 'Green', value: '#22c55e', color: '#22c55e' },
					{ name: 'Blue', value: '#3b82f6', color: '#3b82f6' },
					{ name: 'Purple', value: '#8b5cf6', color: '#8b5cf6' },
					{ name: 'Pink', value: '#ec4899', color: '#ec4899' },
					{ name: 'Cyan', value: '#06b6d4', color: '#06b6d4' }
				]
			},
			{
				name: 'Light Backgrounds',
				colors: [
					{ name: 'Light Gray', value: '#f3f4f6', color: '#f3f4f6' },
					{ name: 'Light Red', value: '#fee2e2', color: '#fee2e2' },
					{ name: 'Light Orange', value: '#ffedd5', color: '#ffedd5' },
					{ name: 'Light Yellow', value: '#fef3c7', color: '#fef3c7' },
					{ name: 'Light Green', value: '#dcfce7', color: '#dcfce7' },
					{ name: 'Light Blue', value: '#dbeafe', color: '#dbeafe' },
					{ name: 'Light Purple', value: '#ede9fe', color: '#ede9fe' },
					{ name: 'Light Pink', value: '#fce7f3', color: '#fce7f3' },
					{ name: 'Light Cyan', value: '#cffafe', color: '#cffafe' },
					{ name: 'Light Slate', value: '#e2e8f0', color: '#e2e8f0' }
				]
			},
			{
				name: 'Custom Font Colors',
				colors: [
					{ name: 'Coral', value: '#ff6b6b', color: '#ff6b6b' },
					{ name: 'Orange', value: '#ffa500', color: '#ffa500' },
					{ name: 'Royal Blue', value: '#4169e1', color: '#4169e1' },
					{ name: 'Medium Purple', value: '#9370db', color: '#9370db' },
					{ name: 'Dim Gray', value: '#696969', color: '#696969' }
				]
			}
		];

		colorSections.forEach(section => {
			const sectionContainer = document.createElement('div');
			sectionContainer.style.marginBottom = '16px';

			const label = document.createElement('div');
			label.textContent = section.name;
			label.style.cssText = `
				font-size: 11px;
				font-weight: 600;
				color: var(--text-normal);
				margin-bottom: 8px;
				padding-bottom: 4px;
				border-bottom: 1px solid var(--background-modifier-border);
				text-transform: uppercase;
				letter-spacing: 0.5px;
			`;
			sectionContainer.appendChild(label);

			const colorGrid = document.createElement('div');
			colorGrid.style.cssText = `
				display: grid !important;
				grid-template-columns: repeat(10, 1fr) !important;
				gap: 6px !important;
				width: 100% !important;
				padding: 4px 0 !important;
			`;

			section.colors.forEach((colorInfo, index) => {
				console.log(`Creating color button ${index + 1}: ${colorInfo.name} (${colorInfo.value})`);
				const colorButton = document.createElement('button');
				colorButton.style.cssText = `
					width: 22px !important;
					height: 22px !important;
					border: 2px solid var(--background-modifier-border) !important;
					border-radius: 50% !important;
					cursor: pointer !important;
					background-color: ${colorInfo.color} !important;
					transition: all 0.2s ease !important;
					padding: 0 !important;
					margin: 0 !important;
					display: flex !important;
					align-items: center !important;
					justify-content: center !important;
					box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12) !important;
				`;
				
				colorButton.title = colorInfo.name;

				if (colorInfo.value === '') {
					const line = document.createElement('div');
					line.style.cssText = `
						width: 70%;
						height: 2px;
						background: var(--text-muted);
						transform: rotate(45deg);
					`;
					colorButton.appendChild(line);
				}

				colorButton.addEventListener('mouseenter', () => {
					colorButton.style.borderColor = 'var(--interactive-accent)';
					colorButton.style.transform = 'scale(1.1)';
					colorButton.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
				});

				colorButton.addEventListener('mouseleave', () => {
					colorButton.style.borderColor = 'var(--background-modifier-border)';
					colorButton.style.transform = 'scale(1)';
					colorButton.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.12)';
				});

				colorButton.addEventListener('click', (e) => {
					e.preventDefault();
					e.stopPropagation();
					
					console.log('>>> Color button CLICK');
					
					// Pass selected cells to TableManager (auto-detection based on selection)
					const cellsToPass = this.selectedCells.size > 0 ? this.selectedCells : undefined;
					console.log('>>> Passing selected cells to TableManager:', cellsToPass ? Array.from(cellsToPass) : 'none');
					
					// Extra debugging for header cells
					if (cellsToPass) {
						cellsToPass.forEach(cellCoord => {
							const parts = cellCoord.split(',');
							const cellType = parts[2] || 'data';
							console.log(`🔍 Selected cell: [${parts[0]}, ${parts[1]}] type: ${cellType}`);
						});
					}
					
					this.tableManager.setCellBackgroundColor(colorInfo.value, cellsToPass);
					picker.remove();
				});

				colorGrid.appendChild(colorButton);
				console.log(`Color button ${index + 1} added to grid`);
			});

			sectionContainer.appendChild(colorGrid);
			picker.appendChild(sectionContainer);
		});

		console.log('=== addPresetColors END ===');
	}

	private addColorSpectrum(picker: HTMLElement): void {
		const spectrumSection = document.createElement('div');
		
		const label = document.createElement('div');
		label.textContent = 'Color Spectrum';
		label.style.cssText = `
			font-size: 12px;
			color: var(--text-muted);
			margin-bottom: 8px;
		`;
		spectrumSection.appendChild(label);

		// Create color spectrum canvas
		const canvas = document.createElement('canvas');
		canvas.width = 256;
		canvas.height = 100;
		canvas.style.cssText = `
			width: 100%;
			height: 80px;
			border: 1px solid var(--background-modifier-border);
			border-radius: 4px;
			cursor: crosshair;
		`;

		const ctx = canvas.getContext('2d');
		if (ctx) {
			// Draw color spectrum
			for (let x = 0; x < 256; x++) {
				for (let y = 0; y < 100; y++) {
					const hue = (x / 256) * 360;
					const saturation = 100;
					const lightness = Math.max(20, 100 - (y / 100) * 60); // Keep colors dark
					ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
					ctx.fillRect(x, y, 1, 1);
				}
			}
		}

		// Add click/drag functionality
		let isMouseDown = false;
		
		const handleColorPick = (e: MouseEvent) => {
			const rect = canvas.getBoundingClientRect();
			const x = ((e.clientX - rect.left) / rect.width) * 256;
			const y = ((e.clientY - rect.top) / rect.height) * 100;
			
			const hue = (x / 256) * 360;
			const saturation = 100;
			const lightness = Math.max(20, 100 - (y / 100) * 60);
			const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
			
			// Pass selected cells to TableManager (auto-detection based on selection)
			const cellsToPass = this.selectedCells.size > 0 ? this.selectedCells : undefined;
			console.log('>>> Spectrum color - Passing selected cells to TableManager:', cellsToPass ? Array.from(cellsToPass) : 'none');
			
			this.tableManager.setCellBackgroundColor(color, cellsToPass);
			picker.remove();
		};

		canvas.addEventListener('mousedown', (e) => {
			isMouseDown = true;
			handleColorPick(e);
		});

		canvas.addEventListener('mousemove', (e) => {
			if (isMouseDown) {
				const rect = canvas.getBoundingClientRect();
				const x = ((e.clientX - rect.left) / rect.width) * 256;
				const y = ((e.clientY - rect.top) / rect.height) * 100;
				
				const hue = (x / 256) * 360;
				const saturation = 100;
				const lightness = Math.max(20, 100 - (y / 100) * 60);
				const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
				
				// Show preview
				canvas.style.borderColor = color;
			}
		});

		canvas.addEventListener('mouseup', () => {
			isMouseDown = false;
			canvas.style.borderColor = 'var(--background-modifier-border)';
		});

		spectrumSection.appendChild(canvas);
		picker.appendChild(spectrumSection);
	}

	private addTableCreatorButton(toolbar: HTMLElement): void {
		const container = document.createElement('div');
		container.className = 'tableToolbarCreatorContainer';
		container.style.cssText = `
			position: relative;
			display: inline-block;
		`;

		const button = document.createElement('button');
		button.className = 'tableToolbarCommandItem';
		button.setAttribute('aria-label', 'Create Table');

		// Create SVG icon
		const svg = this.createIcon('table-plus');
		button.appendChild(svg);

		let sizeSelector: HTMLElement | null = null;
		let hideTimeout: NodeJS.Timeout | null = null;

		const showSelector = () => {
			if (sizeSelector) return;

			sizeSelector = this.createTableSizeSelector();
			document.body.appendChild(sizeSelector);

			// Position relative to button
			const buttonRect = button.getBoundingClientRect();
			sizeSelector.style.position = 'fixed';
			sizeSelector.style.top = `${buttonRect.bottom + 5}px`;
			sizeSelector.style.left = `${buttonRect.left}px`;
			sizeSelector.style.display = 'block';
			sizeSelector.style.zIndex = '999999';

			// Add event listeners to selector for proper closing
			sizeSelector.addEventListener('mouseenter', () => {
				if (hideTimeout) {
					clearTimeout(hideTimeout);
					hideTimeout = null;
				}
			});

			sizeSelector.addEventListener('mouseleave', () => {
				hideTimeout = setTimeout(hideSelector, 100);
			});
		};

		const hideSelector = () => {
			if (sizeSelector) {
				sizeSelector.remove();
				sizeSelector = null;
			}
			if (hideTimeout) {
				clearTimeout(hideTimeout);
				hideTimeout = null;
			}
		};

		// Show on hover
		container.addEventListener('mouseenter', () => {
			if (hideTimeout) {
				clearTimeout(hideTimeout);
				hideTimeout = null;
			}
			showSelector();
		});

		// Hide with delay on mouse leave
		container.addEventListener('mouseleave', () => {
			hideTimeout = setTimeout(hideSelector, 200);
		});

		// Close selector when clicking elsewhere
		document.addEventListener('click', (e) => {
			if (sizeSelector && !sizeSelector.contains(e.target as Node) && !container.contains(e.target as Node)) {
				hideSelector();
			}
		});

		container.appendChild(button);
		toolbar.appendChild(container);
	}

	private createTableSizeSelector(): HTMLElement {
		const selector = document.createElement('div');
		selector.className = 'tableToolbarSizeSelector';
		selector.style.cssText = `
			background: var(--background-primary);
			border: 1px solid var(--background-modifier-border);
			border-radius: 8px;
			padding: 12px;
			box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
			width: 280px;
		`;

		// Title
		const title = document.createElement('div');
		title.textContent = 'Insert Table';
		title.style.cssText = `
			font-size: 12px;
			color: var(--text-muted);
			margin-bottom: 8px;
			text-align: center;
		`;
		selector.appendChild(title);

		// Grid container
		const gridContainer = document.createElement('div');
		gridContainer.style.cssText = `
			display: grid;
			grid-template-columns: repeat(10, 20px);
			gap: 2px;
			margin-bottom: 12px;
			padding: 8px;
			border: 1px solid var(--background-modifier-border);
			border-radius: 4px;
			justify-content: center;
		`;

		// Size label
		const sizeLabel = document.createElement('div');
		sizeLabel.textContent = '1 x 1 Table';
		sizeLabel.style.cssText = `
			text-align: center;
			font-size: 11px;
			color: var(--text-normal);
			margin-bottom: 8px;
		`;
		selector.appendChild(sizeLabel);

		selector.appendChild(gridContainer);

		// Create initial 10x8 grid
		const maxRows = 8;
		const maxCols = 10;
		const cells: HTMLElement[][] = [];

		for (let row = 0; row < maxRows; row++) {
			cells[row] = [];
			for (let col = 0; col < maxCols; col++) {
				const cell = document.createElement('div');
				cell.style.cssText = `
					width: 20px;
					height: 20px;
					border: 1px solid var(--background-modifier-border);
					background: var(--background-primary);
					cursor: pointer;
					transition: all 0.1s ease;
				`;
				
				cell.dataset.row = row.toString();
				cell.dataset.col = col.toString();
				cells[row][col] = cell;
				gridContainer.appendChild(cell);
			}
		}

		// Hover highlighting logic
		const highlightCells = (maxRow: number, maxCol: number) => {
			cells.forEach((row, rowIndex) => {
				row.forEach((cell, colIndex) => {
					if (rowIndex <= maxRow && colIndex <= maxCol) {
						cell.style.backgroundColor = 'var(--interactive-accent)';
					} else {
						cell.style.backgroundColor = 'var(--background-primary)';
					}
				});
			});
			sizeLabel.textContent = `${maxRow + 1} x ${maxCol + 1} Table`;
		};

		// Add event listeners
		cells.forEach((row, rowIndex) => {
			row.forEach((cell, colIndex) => {
				cell.addEventListener('mouseenter', () => {
					highlightCells(rowIndex, colIndex);
				});

				cell.addEventListener('click', (e) => {
					e.preventDefault();
					e.stopPropagation();
					const rows = rowIndex + 1;
					const cols = colIndex + 1;
					console.log(`Creating ${rows}x${cols} table`);
					this.tableManager.createTable(rows, cols);
					selector.remove();
				});
			});
		});

		// Reset highlight when mouse leaves grid
		gridContainer.addEventListener('mouseleave', () => {
			cells.forEach(row => {
				row.forEach(cell => {
					cell.style.backgroundColor = 'var(--background-primary)';
				});
			});
			sizeLabel.textContent = 'Select table size';
		});

		// Add custom size input section
		const customSection = document.createElement('div');
		customSection.style.cssText = `
			border-top: 1px solid var(--background-modifier-border);
			padding-top: 8px;
			display: flex;
			align-items: center;
			gap: 8px;
			font-size: 11px;
		`;

		const customLabel = document.createElement('span');
		customLabel.textContent = 'Custom:';
		customLabel.style.color = 'var(--text-muted)';

		const rowInput = document.createElement('input');
		rowInput.type = 'number';
		rowInput.min = '1';
		rowInput.max = '20';
		rowInput.value = '3';
		rowInput.style.cssText = `
			width: 40px;
			padding: 2px 4px;
			border: 1px solid var(--background-modifier-border);
			border-radius: 3px;
			background: var(--background-primary);
			color: var(--text-normal);
			font-size: 11px;
		`;

		const xLabel = document.createElement('span');
		xLabel.textContent = '×';
		xLabel.style.color = 'var(--text-muted)';

		const colInput = document.createElement('input');
		colInput.type = 'number';
		colInput.min = '1';
		colInput.max = '20';
		colInput.value = '3';
		colInput.style.cssText = `
			width: 40px;
			padding: 2px 4px;
			border: 1px solid var(--background-modifier-border);
			border-radius: 3px;
			background: var(--background-primary);
			color: var(--text-normal);
			font-size: 11px;
		`;

		const createButton = document.createElement('button');
		createButton.textContent = 'Create';
		createButton.style.cssText = `
			padding: 2px 8px;
			border: 1px solid var(--interactive-accent);
			border-radius: 3px;
			background: var(--interactive-accent);
			color: var(--text-on-accent);
			font-size: 11px;
			cursor: pointer;
			transition: all 0.15s ease;
		`;

		createButton.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const rows = parseInt(rowInput.value) || 3;
			const cols = parseInt(colInput.value) || 3;
			console.log(`Creating custom ${rows}x${cols} table`);
			this.tableManager.createTable(rows, cols);
			selector.remove();
		});

		customSection.appendChild(customLabel);
		customSection.appendChild(rowInput);
		customSection.appendChild(xLabel);
		customSection.appendChild(colInput);
		customSection.appendChild(createButton);
		selector.appendChild(customSection);

		return selector;
	}

	private highlightTableSize(selector: HTMLElement, maxRows: number, maxCols: number): void {
		// This method is no longer used - replaced with dynamic grid highlighting
	}

	private createIcon(iconName: string): SVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
		svg.setAttribute('width', '24');
		svg.setAttribute('height', '24');
		svg.setAttribute('viewBox', '1 1 22 22');  // Slightly zoomed in viewBox
		svg.setAttribute('fill', 'none');
		svg.setAttribute('stroke', 'currentColor');
		svg.setAttribute('stroke-width', '3');  // Thicker stroke for better visibility
		svg.setAttribute('stroke-linecap', 'round');
		svg.setAttribute('stroke-linejoin', 'round');
		svg.className.baseVal = 'svg-icon lucide-' + iconName;

		// Icon paths based on iconName - Bold color-coded for better understanding
		const iconPaths: { [key: string]: string } = {
			'table-plus': '<rect x="2" y="2" width="20" height="20" rx="3" stroke-width="3.5" fill="none"></rect><path d="M2 8h20M2 16h20M12 2v20" stroke-width="3.5"></path>',
			'table-row-insert': '<rect x="2" y="2" width="20" height="20" rx="3" stroke-width="3.5" fill="none"></rect><path d="M2 8h20M2 16h20M12 2v20" stroke-width="3.5"></path><rect x="6" y="10" width="12" height="4" fill="#0066FF" stroke="#0044CC" stroke-width="1.5" rx="2"></rect>',
			'table-column-insert': '<rect x="2" y="2" width="20" height="20" rx="3" stroke-width="3.5" fill="none"></rect><path d="M2 8h20M2 16h20M8 2v20M16 2v20" stroke-width="3.5"></path><rect x="10" y="6" width="4" height="12" fill="#0066FF" stroke="#0044CC" stroke-width="1.5" rx="2"></rect>',
			'table-row-delete': '<rect x="2" y="2" width="20" height="20" rx="3" stroke-width="3.5" fill="none"></rect><path d="M2 8h20M2 16h20M12 2v20" stroke-width="3.5"></path><path d="M6 12h12" stroke="#FF0000" stroke-width="5" stroke-linecap="round"></path>',
			'table-column-delete': '<rect x="2" y="2" width="20" height="20" rx="3" stroke-width="3.5" fill="none"></rect><path d="M2 8h20M2 16h20M8 2v20M16 2v20" stroke-width="3.5"></path><path d="M12 6v12" stroke="#FF0000" stroke-width="5" stroke-linecap="round"></path>',
			'move-row-up': '<rect x="1" y="1" width="22" height="22" rx="4" stroke-width="3" fill="none" stroke="currentColor"></rect><path d="M2 8h20M2 16h20M12 2v20" stroke-width="3" stroke="currentColor"></path><path d="M5 14l7-8 7 8" stroke="#22C55E" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>',
			'move-row-down': '<rect x="1" y="1" width="22" height="22" rx="4" stroke-width="3" fill="none" stroke="currentColor"></rect><path d="M2 8h20M2 16h20M12 2v20" stroke-width="3" stroke="currentColor"></path><path d="M5 10l7 8 7-8" stroke="#22C55E" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>',
			'move-column-left': '<rect x="1" y="1" width="22" height="22" rx="4" stroke-width="3" fill="none" stroke="currentColor"></rect><path d="M2 8h20M2 16h20M8 2v20M16 2v20" stroke-width="3" stroke="currentColor"></path><path d="M14 5l-8 7 8 7" stroke="#22C55E" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>',
			'move-column-right': '<rect x="1" y="1" width="22" height="22" rx="4" stroke-width="3" fill="none" stroke="currentColor"></rect><path d="M2 8h20M2 16h20M8 2v20M16 2v20" stroke-width="3" stroke="currentColor"></path><path d="M10 5l8 7-8 7" stroke="#22C55E" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>',
			'csv-import': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2.5" fill="none"></path><polyline points="7,10 12,15 17,10" stroke="#22C55E" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"></polyline><path d="m12 15V3" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"></path>',
			'csv-export': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2.5" fill="none"></path><polyline points="17,8 12,3 7,8" stroke="#3B82F6" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"></polyline><path d="m12 3v12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"></path>',
			'table-sort': '<path d="M5 9l7-5 7 5z" fill="currentColor"></path><path d="M5 15l7 5 7-5z" fill="currentColor"></path>',
			'table': '<rect x="2" y="2" width="20" height="20" rx="3" stroke-width="3.5" fill="none"></rect><path d="M2 8h20M2 16h20M12 2v20" stroke-width="3.5"></path>',
			'color-fill': '<path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8L5 17l4 4 2.6-2.6a2 2 0 0 0 2.8 0l8.6-8.6Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"></path><path d="m5 2 5 5" stroke="currentColor" stroke-width="3" stroke-linecap="round"></path><path d="m2 13 9 9" stroke="currentColor" stroke-width="3" stroke-linecap="round"></path><path d="m10 10 7.5 7.5" stroke="currentColor" stroke-width="3" stroke-linecap="round"></path><circle cx="16" cy="8" r="1.5" fill="currentColor"></circle><path d="M2 20h20" stroke="#3B82F6" stroke-width="5" stroke-linecap="round"></path>'
		};

		svg.innerHTML = iconPaths[iconName] || iconPaths['table'];
		return svg;
	}


	insertIntoDOM(): boolean {
		console.log('insertIntoDOM called');
		
		if (this.toolbarElement) {
			console.log('Toolbar element already exists, skipping insertion');
			return true; // Already inserted
		}

		try {
			this.toolbarElement = this.createToolbar();
			console.log('Toolbar element created successfully');
			
			// Always force top position regardless of other settings
			const insertionSuccess = this.insertAtTopPosition();
			
			if (!insertionSuccess) {
				console.warn('Failed to insert toolbar at top position, trying fallback');
				return this.insertAtFallbackPosition();
			}

			return insertionSuccess;
		} catch (error) {
			console.error('Error during toolbar insertion:', error);
			return false;
		}
	}

	private insertAtTopPosition(): boolean {
		// Get the current active workspace leaf to ensure we insert in the right tab
		const activeLeaf = (this.app.workspace as any).activeLeaf;
		if (!activeLeaf) {
			console.warn('No active leaf found');
			return false;
		}

		const leafContainer = activeLeaf.containerEl;
		console.log('🎯 Targeting active leaf container for toolbar insertion');

		// Find all existing toolbars in the current leaf - 더 정확한 선택자 사용
		const toolbarSelectors = [
			'.editingToolbarTinyAesthetic',   // Default Obsidian editing toolbar
			'.mk-toolbar',                    // Make.md toolbar
			'.mk-editor-toolbar',             // Alternative Make.md toolbar
			'.makemd-toolbar'                 // Another Make.md variant
		];

		let insertionParent = null;
		let insertionPoint = null;

		// 기존 toolbar를 찾고 그와 같은 레벨에 삽입
		for (const selector of toolbarSelectors) {
			const existingToolbar = leafContainer.querySelector(selector);
			if (existingToolbar) {
				insertionParent = existingToolbar.parentElement;
				insertionPoint = existingToolbar.nextSibling;
				console.log(`🔍 Found existing toolbar: ${selector}`);
				break;
			}
		}

		// 기존 toolbar가 있으면 같은 부모에 삽입
		if (insertionParent) {
			if (insertionPoint) {
				insertionParent.insertBefore(this.toolbarElement!, insertionPoint);
				console.log('🔧 Toolbar inserted after existing toolbar (before next sibling)');
			} else {
				insertionParent.appendChild(this.toolbarElement!);
				console.log('🔧 Toolbar inserted after existing toolbar (as last child)');
			}
			return true;
		}

		// 기존 toolbar가 없으면 view-header 바로 다음에 삽입 (content 내부가 아닌)
		const viewHeader = leafContainer.querySelector('.view-header');
		if (viewHeader) {
			const leafContentContainer = viewHeader.parentElement; // leaf의 직접 자식 레벨
			if (leafContentContainer) {
				const nextSibling = viewHeader.nextSibling;
				if (nextSibling) {
					leafContentContainer.insertBefore(this.toolbarElement!, nextSibling);
					console.log('🔧 Toolbar inserted after view header at leaf level');
				} else {
					leafContentContainer.appendChild(this.toolbarElement!);
					console.log('🔧 Toolbar inserted after view header (as last child)');
				}
				return true;
			}
		}

		// 마지막 fallback: leaf container의 최상단에 삽입 (view-header가 없는 경우)
		const firstChild = leafContainer.firstChild;
		if (firstChild) {
			leafContainer.insertBefore(this.toolbarElement!, firstChild);
			console.log('🔧 Toolbar inserted at very top of leaf container');
		} else {
			leafContainer.appendChild(this.toolbarElement!);
			console.log('🔧 Toolbar inserted as first child of empty leaf container');
		}
		return true;
	}

	private insertAtFallbackPosition(): boolean {
		// Fallback: Create fixed positioned toolbar at top
		this.toolbarElement!.style.position = 'fixed';
		this.toolbarElement!.style.top = '10px';  // Always at top
		this.toolbarElement!.style.left = '50%';  // Center horizontally
		this.toolbarElement!.style.transform = 'translateX(-50%)';  // Perfect center
		this.toolbarElement!.style.zIndex = this.getOptimalZIndex();  // Dynamic z-index
		this.toolbarElement!.style.backgroundColor = 'var(--background-primary)';
		this.toolbarElement!.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
		this.toolbarElement!.style.borderRadius = '8px';
		this.toolbarElement!.style.padding = '4px';
		
		document.body.appendChild(this.toolbarElement!);
		console.log('Toolbar inserted at body (fixed top position)');
		return true;
	}

	private getOptimalZIndex(): string {
		// Dynamic z-index calculation to avoid conflicts
		const editingToolbar = document.querySelector('.editingToolbarTinyAesthetic');
		const modals = document.querySelectorAll('.modal, .menu, .suggestion-container');
		
		let maxZIndex = 1000; // Safe minimum
		
		// Check editing toolbar z-index
		if (editingToolbar) {
			const computedStyle = window.getComputedStyle(editingToolbar);
			const editingZIndex = parseInt(computedStyle.zIndex) || 1000;
			maxZIndex = Math.max(maxZIndex, editingZIndex);
			console.log(`Editing toolbar z-index: ${editingZIndex}`);
		}
		
		// Check other UI elements
		modals.forEach(modal => {
			const computedStyle = window.getComputedStyle(modal);
			const modalZIndex = parseInt(computedStyle.zIndex) || 0;
			if (modalZIndex > 0) {
				maxZIndex = Math.max(maxZIndex, modalZIndex);
			}
		});
		
		// Return one level higher, but not too high to interfere with modals
		const optimalZIndex = Math.min(maxZIndex + 1, 1500);
		console.log(`Calculated optimal z-index: ${optimalZIndex}`);
		return optimalZIndex.toString();
	}

	show(): void {
		if (this.toolbarElement) {
			this.toolbarElement.style.visibility = 'visible';
			this.toolbarElement.style.display = 'block';
			this.isVisible = true;
		}
	}

	hide(): void {
		if (this.toolbarElement) {
			this.toolbarElement.style.visibility = 'hidden';
			this.toolbarElement.style.display = 'none';
			this.isVisible = false;
		}
	}

	updateVisibility(): void {
		const activeEditor = this.app.workspace.activeEditor;
		if (!activeEditor?.editor) {
			this.hide();
			return;
		}

		const editor = activeEditor.editor;
		const cursor = editor.getCursor();
		const content = editor.getValue();
		
		const table = MarkdownParser.getTableAtCursor(content, cursor.line);
		
		if (table) {
			this.show();
		} else {
			// Show toolbar with limited functionality when not in table
			this.show();
		}
	}

	destroy(): void {
		if (this.toolbarElement) {
			this.toolbarElement.remove();
			this.toolbarElement = null;
			this.isVisible = false;
		}
		
		// Clean up custom selection event listeners
		document.removeEventListener('mousedown', this.handleGlobalMouseDown.bind(this));
		document.removeEventListener('mousemove', this.handleGlobalMouseMove.bind(this));
		document.removeEventListener('mouseup', this.handleGlobalMouseUp.bind(this));
	}

	private setupCustomCellSelection(): void {
		console.log('Setting up custom cell selection tracking');
		
		// Add global mouse event listeners for cell selection
		document.addEventListener('mousedown', this.handleGlobalMouseDown.bind(this));
		document.addEventListener('mousemove', this.handleGlobalMouseMove.bind(this));
		document.addEventListener('mouseup', this.handleGlobalMouseUp.bind(this));
	}

	private handleGlobalMouseDown(event: MouseEvent): void {
		const target = event.target as HTMLElement;
		
		// Check if click is inside a table cell in editor
		if (this.isTableCell(target)) {
			console.log('🖱️  Mouse down on table cell', target);
			
			const cellInfo = this.getCellInfo(target);
			if (cellInfo) {
				this.isDragging = true;
				this.dragStartCell = cellInfo;
				this.selectedCells.clear();
				this.selectedCells.add(`${cellInfo.row},${cellInfo.col},${cellInfo.type}`);
				
				console.log('🎯 Drag started at cell:', cellInfo);
			}
		}
	}

	private handleGlobalMouseMove(event: MouseEvent): void {
		if (!this.isDragging) return;
		
		const target = event.target as HTMLElement;
		if (this.isTableCell(target)) {
			const cellInfo = this.getCellInfo(target);
			if (cellInfo && this.dragStartCell) {
				// Clear previous selection
				this.selectedCells.clear();
				
				// Convert both start and end positions to HTML row indices for consistent calculation
				const startHtmlRow = this.dragStartCell.type === 'header' ? 0 : this.dragStartCell.row + 1;
				const endHtmlRow = cellInfo.type === 'header' ? 0 : cellInfo.row + 1;
				
				// Calculate selection rectangle using HTML-based coordinates
				const startRow = Math.min(startHtmlRow, endHtmlRow);
				const endRow = Math.max(startHtmlRow, endHtmlRow);
				const startCol = Math.min(this.dragStartCell.col, cellInfo.col);
				const endCol = Math.max(this.dragStartCell.col, cellInfo.col);
				
				// Add all cells in rectangle to selection
				for (let htmlRow = startRow; htmlRow <= endRow; htmlRow++) {
					for (let col = startCol; col <= endCol; col++) {
						if (htmlRow === 0) {
							// Header row
							this.selectedCells.add(`0,${col},header`);
						} else {
							// Data row: convert HTML row index to data row index
							const dataRowIndex = htmlRow - 1;
							this.selectedCells.add(`${dataRowIndex},${col},data`);
						}
					}
				}
				
				console.log('📏 Selection updated:', Array.from(this.selectedCells));
			}
		}
	}

	private handleGlobalMouseUp(_event: MouseEvent): void {
		if (this.isDragging) {
			console.log('🖱️  Mouse up - final selection:', Array.from(this.selectedCells));
			this.isDragging = false;
			this.dragStartCell = null;
		}
	}

	private isTableCell(element: HTMLElement): boolean {
		// Check if element is inside Obsidian's markdown table
		return element.closest('.cm-table-widget') !== null || 
			   element.closest('table') !== null ||
			   element.tagName === 'TD' || 
			   element.tagName === 'TH';
	}

	private getCellInfo(element: HTMLElement): CellPosition | null {
		// This is a simplified version - would need to be adapted to Obsidian's table structure
		const tableRow = element.closest('tr');
		const table = element.closest('table');
		
		if (tableRow && table) {
			const rows = Array.from(table.querySelectorAll('tr'));
			const cells = Array.from(tableRow.querySelectorAll('td, th'));
			
			const htmlRowIndex = rows.indexOf(tableRow);
			const colIndex = cells.indexOf(element.closest('td, th') as HTMLElement);
			
			console.log(`🔍 HTML row index: ${htmlRowIndex}, Col: ${colIndex}`);
			
			if (colIndex >= 0) {
				if (htmlRowIndex === 0) {
					// 헤더 셀
					console.log(`✅ Header cell detected: [${htmlRowIndex}, ${colIndex}]`);
					return { row: 0, col: colIndex, type: 'header' };
				} else if (htmlRowIndex >= 1) {
					// 데이터 셀 - HTML 인덱스를 데이터 인덱스로 변환
					const dataRowIndex = htmlRowIndex - 1;
					console.log(`✅ Data cell detected: HTML[${htmlRowIndex}] → Data[${dataRowIndex}, ${colIndex}]`);
					return { row: dataRowIndex, col: colIndex, type: 'data' };
				}
			}
		}
		
		return null;
	}

	public getSelectedCells(): {row: number, col: number}[] {
		return Array.from(this.selectedCells).map(cellCoord => {
			const [row, col] = cellCoord.split(',').map(Number);
			return { row, col };
		});
	}

	public hasSelectedCells(): boolean {
		return this.selectedCells.size > 0;
	}

	public clearSelection(): void {
		this.selectedCells.clear();
	}
}

