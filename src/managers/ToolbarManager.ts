import { App, WorkspaceLeaf, TFile } from 'obsidian';
import { TableToolbar } from '../components/TableToolbar';
import { TableManager } from './TableManager';
import { MarkdownParser } from '../utils/MarkdownParser';
import { TableManagerSettings } from '../settings';

export class ToolbarManager {
	app: App;
	tableManager: TableManager;
	settings: TableManagerSettings;
	tableToolbar: TableToolbar | null = null;
	private observers: Map<string, () => void> = new Map();
	private checkInterval: number | null = null;
	private lastCursorPosition: { line: number; ch: number } | null = null;
	private domObserver: MutationObserver | null = null;
	private retryAttempts: number = 0;
	private maxRetryAttempts: number = 20;
	
	// 이벤트 디바운싱 및 상태 관리
	private isCreatingToolbar: boolean = false;
	private lastActiveFile: string | null = null;
	private debounceTimers: Map<string, number> = new Map();
	private lastWorkspaceChangeTime: number = 0;
	private toolbarInitialized: boolean = false; // toolbar가 이미 초기화되었는지 추적
	private currentWorkspaceId: string | null = null; // 현재 workspace 식별자
	private mouseClickListener: ((event: MouseEvent) => void) | null = null; // 마우스 클릭 리스너

	constructor(app: App, tableManager: TableManager, settings: TableManagerSettings) {
		this.app = app;
		this.tableManager = tableManager;
		this.settings = settings;
	}

	private debounce(key: string, func: () => void, delay: number): void {
		// 기존 타이머 취소
		const existingTimer = this.debounceTimers.get(key);
		if (existingTimer) {
			window.clearTimeout(existingTimer);
		}

		// 새 타이머 설정
		const newTimer = window.setTimeout(() => {
			this.debounceTimers.delete(key);
			func();
		}, delay);

		this.debounceTimers.set(key, newTimer);
	}

	private shouldSkipWorkspaceChange(currentFile: string): boolean {
		const now = Date.now();
		const timeSinceLastChange = now - this.lastWorkspaceChangeTime;
		
		// 같은 파일이고 최근에 변경된 경우 스킵
		if (this.lastActiveFile === currentFile && timeSinceLastChange < 500) {
			console.log('⏭️ Skipping workspace change - too recent or same file');
			return true;
		}

		// 툴바 생성 중인 경우 스킵
		if (this.isCreatingToolbar) {
			console.log('⏭️ Skipping workspace change - toolbar creation in progress');
			return true;
		}

		return false;
	}

	initialize(): void {
		console.log('ToolbarManager initialize - enableTableToolbar:', this.settings.enableTableToolbar);
		if (this.settings.enableTableToolbar) {
			this.setupToolbar();
			this.registerEventListeners();
			this.startCursorTracking();
		} else {
			console.log('Table toolbar is disabled in settings');
		}
	}

	private setupToolbar(): void {
		console.log('Setting up toolbar...');
		// Start progressive initialization with enhanced monitoring
		this.startProgressiveInitialization();
	}

	private startProgressiveInitialization(): void {
		console.log('Starting progressive initialization...');
		this.retryAttempts = 0;
		
		// Start DOM monitoring immediately
		this.setupDOMObserver();
		
		// Try immediate initialization
		this.attemptToolbarCreation();
	}

	private setupDOMObserver(): void {
		if (this.domObserver) {
			this.domObserver.disconnect();
		}

		this.domObserver = new MutationObserver((mutations) => {
			let shouldRetryCreation = false;
			let isSearchDialogChange = false;
			
			mutations.forEach((mutation) => {
				mutation.addedNodes.forEach((node) => {
					if (node.nodeType === Node.ELEMENT_NODE) {
						const element = node as Element;
						
						// 검색창 관련 DOM 변화는 무시
						if (element.matches('.document-search-container') || 
							element.querySelector('.document-search-container') ||
							element.matches('.document-replace') ||
							element.querySelector('.document-replace')) {
							console.log('🔍 Search dialog detected - ignoring for toolbar stability');
							isSearchDialogChange = true;
							return;
						}
						
						// Check for editing toolbar appearance in current workspace (only if not search-related)
						if (element.matches('.editingToolbarTinyAesthetic') || 
							element.querySelector('.editingToolbarTinyAesthetic')) {
							console.log('🔍 Editing toolbar detected via MutationObserver');
							shouldRetryCreation = true;
						}
						
						// Check for workspace changes (only if not search-related)
						if (element.matches('.workspace-leaf-content') ||
							element.querySelector('.workspace-leaf-content')) {
							console.log('🔍 Workspace content detected via MutationObserver');
							shouldRetryCreation = true;
						}

						// Check for new workspace leaves (탭 생성) (only if not search-related)
						if (element.matches('.workspace-leaf') ||
							element.querySelector('.workspace-leaf')) {
							console.log('🔍 New workspace leaf detected via MutationObserver');
							shouldRetryCreation = true;
						}
					}
				});
				
				// 검색창이 제거될 때도 toolbar 재생성하지 않음
				mutation.removedNodes.forEach((node) => {
					if (node.nodeType === Node.ELEMENT_NODE) {
						const element = node as Element;
						if (element.matches('.document-search-container') || 
							element.querySelector('.document-search-container')) {
							console.log('🔍 Search dialog removed - ignoring for toolbar stability');
							isSearchDialogChange = true;
						}
					}
				});
			});
			
			// 검색창 관련 변화면 toolbar 재생성하지 않음
			if (isSearchDialogChange) {
				console.log('⏭️ Skipping toolbar recreation - search dialog change detected');
				return;
			}
			
			// Only retry if we don't have a toolbar in the current workspace and toolbar not already initialized for this workspace
			if (shouldRetryCreation && !this.toolbarInitialized) {
				const activeFile = this.app.workspace.activeEditor?.file;
				const needsToolbar = activeFile && activeFile.extension === 'md' && 
					(!this.tableToolbar || !this.isToolbarInCurrentWorkspace());
				
				if (needsToolbar) {
					console.log('🚀 Triggering toolbar creation from MutationObserver');
					setTimeout(() => this.attemptToolbarCreation(), 100);
				}
			}
		});

		// Monitor the workspace container for changes
		const workspaceContainer = document.querySelector('.workspace') || document.body;
		this.domObserver.observe(workspaceContainer, {
			childList: true,
			subtree: true,
			attributes: false
		});

		console.log('📡 DOM MutationObserver activated for workspace');
	}

	private attemptToolbarCreation(): void {
		if (this.retryAttempts >= this.maxRetryAttempts) {
			console.error(`❌ Failed to create toolbar after ${this.maxRetryAttempts} attempts`);
			this.isCreatingToolbar = false;
			return;
		}

		this.retryAttempts++;
		console.log(`🔄 Toolbar creation attempt ${this.retryAttempts}/${this.maxRetryAttempts}`);

		// Check readiness conditions
		const workspace = this.app.workspace;
		const workspaceLeaf = document.querySelector('.workspace-leaf-content');
		const editingToolbar = document.querySelector('.editingToolbarTinyAesthetic');
		
		console.log('📊 Readiness status:', {
			workspace: !!workspace,
			workspaceLeaf: !!workspaceLeaf,
			editingToolbar: !!editingToolbar,
			existingToolbar: !!(this.tableToolbar && document.contains(this.tableToolbar.toolbarElement)),
			isCreatingToolbar: this.isCreatingToolbar
		});

		// Try to create toolbar if conditions are met
		if (workspace && workspaceLeaf) {
			try {
				this.createAndInsertToolbar();
				console.log('✅ Toolbar creation successful');
				// Don't set isCreatingToolbar = false here - let createAndInsertToolbar handle it
				return;
			} catch (error) {
				console.error('❌ Toolbar creation failed:', error);
				this.isCreatingToolbar = false; // Reset flag on error
			}
		}

		// Schedule retry if not at maximum attempts
		if (this.retryAttempts < this.maxRetryAttempts) {
			const retryDelay = Math.min(500 * this.retryAttempts, 3000); // Progressive delay
			console.log(`⏱️  Scheduling retry in ${retryDelay}ms`);
			setTimeout(() => this.attemptToolbarCreation(), retryDelay);
		} else {
			this.isCreatingToolbar = false;
		}
	}

	private createAndInsertToolbar(): void {
		console.log('Creating and inserting toolbar...');
		
		// toolbar가 이미 초기화되어 있으면 건너뛰기
		if (this.toolbarInitialized && this.tableToolbar && this.isToolbarInCurrentWorkspace()) {
			console.log('⏭️ Toolbar already initialized for current workspace - skipping creation');
			this.isCreatingToolbar = false;
			return;
		}
		
		if (this.tableToolbar) {
			console.log('Destroying existing toolbar');
			this.tableToolbar.destroy();
			this.toolbarInitialized = false;
		}

		try {
			this.tableToolbar = new TableToolbar(this.app, this.tableManager, this.settings);
			const insertResult = this.tableToolbar.insertIntoDOM();
			
			if (insertResult) {
				console.log('Toolbar successfully inserted into DOM');
				this.toolbarInitialized = true; // 초기화 완료 마크
				this.updateCurrentWorkspaceId(); // 현재 workspace ID 업데이트
				
				// Give a small delay before initial setup to ensure DOM is stable
				setTimeout(() => {
					console.log('🔄 Initial toolbar setup after creation');
					// Start with hidden toolbar, will be shown based on cursor position
					this.tableToolbar!.hide();
					this.updateToolbarContextOnly();
				}, 100);
			} else {
				console.error('Failed to insert toolbar into DOM');
				this.toolbarInitialized = false;
			}
		} catch (error) {
			console.error('Error creating toolbar:', error);
			this.toolbarInitialized = false;
		} finally {
			// Always reset the creation flag
			this.isCreatingToolbar = false;
			console.log('🏁 Toolbar creation process completed - isCreatingToolbar set to false');
		}
	}

	// Add method to recreate toolbar if it's missing
	public recreateToolbarIfNeeded(): void {
		const activeEditor = this.app.workspace.activeEditor;
		const activeFile = activeEditor?.file;
		
		// Only create toolbar for markdown files
		if (!activeFile || activeFile.extension !== 'md') {
			if (this.tableToolbar) {
				console.log('🗑️ Removing toolbar for non-markdown file');
				this.tableToolbar.destroy();
				this.tableToolbar = null;
			}
			return;
		}

		// Check if toolbar exists and is in the current tab's DOM
		const toolbarExists = !!(this.tableToolbar && this.tableToolbar.toolbarElement);
		const toolbarElement = this.tableToolbar?.toolbarElement;
		const toolbarInDOM = toolbarExists && toolbarElement && document.contains(toolbarElement);
		const toolbarInCurrentWorkspace = toolbarExists && this.isToolbarInCurrentWorkspace();

		console.log('🔍 Toolbar status check:', {
			toolbarExists: !!toolbarExists,
			toolbarInDOM: !!toolbarInDOM,
			toolbarInCurrentWorkspace: !!toolbarInCurrentWorkspace,
			currentFile: activeFile.path
		});

		if (!toolbarExists || !toolbarInDOM || !toolbarInCurrentWorkspace) {
			console.log('🔧 Toolbar missing or not in current workspace, recreating...');
			if (this.tableToolbar) {
				this.tableToolbar.destroy();
				this.tableToolbar = null;
			}
			this.retryAttempts = 0;
			this.attemptToolbarCreation();
		} else {
			// Ensure toolbar is always at the top position
			this.ensureToolbarAtTopPosition();
		}
	}

	private updateCurrentWorkspaceId(): void {
		const activeLeaf = this.app.workspace.activeLeaf;
		if (activeLeaf) {
			// workspace leaf의 고유 식별자 생성 (DOM element의 경우 unique identifier 사용)
			const leafContainer = (activeLeaf as any).containerEl;
			if (leafContainer) {
				this.currentWorkspaceId = leafContainer.getAttribute('data-leaf-id') || 
										  leafContainer.closest('.workspace-leaf')?.getAttribute('data-leaf-id') || 
										  'default-workspace';
			}
		}
	}

	private isToolbarInCurrentWorkspace(): boolean {
		if (!this.tableToolbar?.toolbarElement) {
			return false;
		}

		// Check if toolbar is in the current active workspace leaf
		const activeLeaf = this.app.workspace.activeLeaf;
		if (!activeLeaf) {
			return false;
		}

		const leafContainer = (activeLeaf as any).containerEl;
		if (!leafContainer) {
			return false;
		}

		return leafContainer.contains(this.tableToolbar.toolbarElement);
	}

	private ensureToolbarAtTopPosition(): void {
		if (!this.tableToolbar || !this.tableToolbar.toolbarElement) {
			return;
		}

		const toolbar = this.tableToolbar.toolbarElement;
		const parentElement = toolbar.parentElement;
		
		// Check if toolbar is not in the expected top position
		if (parentElement) {
			// If toolbar is not the first or second child (allowing for one element like header), move it to top
			const children = Array.from(parentElement.children);
			const toolbarIndex = children.indexOf(toolbar);
			
			if (toolbarIndex > 2) {  // Allow some elements before toolbar
				console.log('Toolbar not at top position, moving it...');
				
				// Find the best position (after view-header if it exists, otherwise first)
				const viewHeader = parentElement.querySelector('.view-header');
				if (viewHeader) {
					const nextSibling = viewHeader.nextSibling;
					if (nextSibling && nextSibling !== toolbar) {
						parentElement.insertBefore(toolbar, nextSibling);
					}
				} else {
					// Move to the beginning
					parentElement.insertBefore(toolbar, parentElement.firstChild);
				}
				console.log('Toolbar repositioned to top');
			}
		}
	}

	private registerEventListeners(): void {
		// Listen for workspace changes (탭 전환) - 디바운싱 적용
		this.app.workspace.on('active-leaf-change', () => {
			console.log('🔄 Active leaf changed - scheduling workspace change');
			this.debounce('workspace-change', () => {
				this.handleWorkspaceChange();
			}, 200);
		});

		// Listen for file changes - 디바운싱 적용
		this.app.workspace.on('editor-change', () => {
			console.log('📝 Editor changed - scheduling toolbar update');
			this.debounce('editor-change', () => {
				this.handleEditorChange();
			}, 100);
		});

		// Listen for layout changes - 디바운싱 적용
		this.app.workspace.on('layout-change', () => {
			console.log('🏗️ Layout changed - scheduling toolbar check');
			this.debounce('layout-change', () => {
				this.recreateToolbarIfNeeded();
			}, 300);
		});

		// Listen for file opening (새 탭 열기) - 가장 긴 디바운싱
		this.app.workspace.on('file-open', () => {
			console.log('📂 File opened - scheduling toolbar presence check');
			this.debounce('file-open', () => {
				this.handleWorkspaceChange();
			}, 400);
		});

		// Listen for window resize (분할 화면 등) - 디바운싱 적용
		this.app.workspace.on('resize', () => {
			console.log('🔄 Window resized - scheduling toolbar check');
			this.debounce('resize', () => {
				this.recreateToolbarIfNeeded();
			}, 500);
		});

		// Listen for mouse clicks to detect cursor position changes
		this.registerMouseClickListener();
	}

	private registerMouseClickListener(): void {
		// Remove existing listener if any
		if (this.mouseClickListener) {
			document.removeEventListener('click', this.mouseClickListener);
		}

		this.mouseClickListener = (event: MouseEvent) => {
			// Only handle clicks in markdown editor
			const target = event.target as HTMLElement;
			const editorContainer = target.closest('.cm-editor, .markdown-source-view');
			
			if (editorContainer && this.tableToolbar) {
				console.log('📍 Mouse click detected in editor - checking toolbar context');
				// Debounce the context update to avoid too frequent checks
				this.debounce('mouse-click-context', () => {
					this.updateToolbarContextOnly();
				}, 150);
			}
		};

		document.addEventListener('click', this.mouseClickListener);
		console.log('👆 Mouse click listener registered for toolbar context updates');
	}

	private handleWorkspaceChange(): void {
		console.log('🔄 Handling workspace change...');
		
		const activeEditor = this.app.workspace.activeEditor;
		const activeFile = activeEditor?.file;
		const currentFilePath = activeFile?.path || 'none';
		
		// 현재 workspace ID 확인
		const previousWorkspaceId = this.currentWorkspaceId;
		this.updateCurrentWorkspaceId();
		const isWorkspaceChange = previousWorkspaceId !== this.currentWorkspaceId;
		
		console.log('📊 Workspace state:', {
			activeEditor: !!activeEditor,
			activeFile: currentFilePath,
			isMarkdown: activeFile?.extension === 'md',
			lastActiveFile: this.lastActiveFile,
			isWorkspaceChange: isWorkspaceChange,
			toolbarInitialized: this.toolbarInitialized
		});

		// 중복 작업 방지 체크
		if (this.shouldSkipWorkspaceChange(currentFilePath)) {
			return;
		}

		// 같은 workspace에서 같은 파일이면 toolbar 재생성하지 않음
		if (!isWorkspaceChange && this.toolbarInitialized && 
			this.tableToolbar && this.isToolbarInCurrentWorkspace()) {
			console.log('⏭️ Same workspace and toolbar exists - skipping recreation');
			// toolbar는 이미 있으므로 context만 업데이트
			this.updateToolbarContextOnly();
			return;
		}

		// 상태 업데이트
		this.lastActiveFile = currentFilePath;
		this.lastWorkspaceChangeTime = Date.now();
		this.isCreatingToolbar = true;

		try {
			// workspace가 변경되었거나 toolbar가 없는 경우에만 재생성
			if (isWorkspaceChange || !this.toolbarInitialized || !this.tableToolbar || !this.isToolbarInCurrentWorkspace()) {
				// 기존 툴바 정리
				if (this.tableToolbar) {
					console.log('🗑️ Destroying existing toolbar for workspace change');
					this.tableToolbar.destroy();
					this.tableToolbar = null;
				}
				
				// 초기화 상태 리셋
				this.toolbarInitialized = false;
				this.retryAttempts = 0;
				
				// Only create toolbar for markdown files
				if (activeFile && activeFile.extension === 'md') {
					console.log('✅ Creating toolbar for markdown file');
					setTimeout(() => {
						this.attemptToolbarCreation();
					}, 100); // Short delay for DOM stability
				} else {
					console.log('⏭️ Skipping toolbar creation for non-markdown file');
					this.isCreatingToolbar = false;
				}
			} else {
				console.log('⏭️ Toolbar exists in current workspace - updating context only');
				this.isCreatingToolbar = false;
				this.updateToolbarContextOnly();
			}
		} catch (error) {
			console.error('❌ Error in workspace change handling:', error);
			this.isCreatingToolbar = false;
			this.toolbarInitialized = false;
		}
	}

	private handleEditorChange(): void {
		// Update toolbar context when editor content changes, but don't hide toolbar
		if (this.tableToolbar) {
			this.updateToolbarContextOnly();
		}
	}



	private startCursorTracking(): void {
		// Simplified cursor tracking - only for context updates, not visibility
		this.checkInterval = window.setInterval(() => {
			this.checkCursorPositionForContext();
		}, 1000); // Reduced frequency
	}

	private checkCursorPositionForContext(): void {
		const activeEditor = this.app.workspace.activeEditor;
		if (!activeEditor?.editor || !this.tableToolbar) {
			return; // Don't hide toolbar, just skip context update
		}

		const cursor = activeEditor.editor.getCursor();
		
		// Only update if cursor position changed
		if (this.lastCursorPosition && 
			this.lastCursorPosition.line === cursor.line && 
			this.lastCursorPosition.ch === cursor.ch) {
			return;
		}

		this.lastCursorPosition = { line: cursor.line, ch: cursor.ch };
		this.updateToolbarContextOnly(); // Only update context, not visibility
	}

	private updateToolbarVisibility(): void {
		if (!this.tableToolbar) {
			return;
		}

		// Skip visibility check if we're currently creating a toolbar
		if (this.isCreatingToolbar) {
			console.log('⏭️ Skipping visibility check - toolbar creation in progress');
			return;
		}

		const activeEditor = this.app.workspace.activeEditor;
		const activeFile = activeEditor?.file;
		
		// Create toolbar for markdown files, but initially hide it
		if (activeEditor?.editor && activeFile && activeFile.path.endsWith('.md')) {
			console.log('✅ Markdown file - toolbar available but hidden by default');
			// Initially hide toolbar, will be shown based on cursor position
			this.hideToolbar();
			// Check initial context to determine if should be shown
			this.updateToolbarContextOnly();
		} else {
			console.log('📄 Not a markdown file - hiding toolbar');
			this.hideToolbar();
		}
	}

	private updateToolbarContextOnly(): void {
		if (!this.tableToolbar) {
			return;
		}

		const activeEditor = this.app.workspace.activeEditor;
		if (!activeEditor?.editor) {
			this.hideToolbar();
			return;
		}

		const editor = activeEditor.editor;
		const cursor = editor.getCursor();
		const content = editor.getValue();
		
		// Check if cursor is near a table
		const table = MarkdownParser.getTableAtCursor(content, cursor.line);
		const isNearTable = this.isNearTable(content, cursor.line);
		const isInTableContext = !!(table || isNearTable);

		if (isInTableContext) {
			console.log('📊 Cursor near table - showing toolbar');
			this.showToolbar();
			this.updateToolbarContext(true); // Enable all buttons
		} else {
			console.log('📝 Cursor not near table - hiding toolbar');
			this.hideToolbar();
		}
	}

	private isNearTable(content: string, cursorLine: number): boolean {
		const lines = content.split('\n');
		const searchRange = 3; // Check 3 lines above and below
		
		for (let i = Math.max(0, cursorLine - searchRange); 
			 i <= Math.min(lines.length - 1, cursorLine + searchRange); 
			 i++) {
			if (this.isTableLine(lines[i])) {
				return true;
			}
		}
		
		return false;
	}

	private isTableLine(line: string): boolean {
		// Simple check for table lines (contains | and has content)
		return line.trim().includes('|') && line.trim().length > 2;
	}

	private showToolbar(): void {
		if (this.tableToolbar) {
			this.tableToolbar.show();
		}
	}

	private hideToolbar(): void {
		if (this.tableToolbar) {
			this.tableToolbar.hide();
		}
	}

	private updateToolbarContext(isInTable: boolean): void {
		if (!this.tableToolbar?.toolbarElement) {
			return;
		}

		const toolbar = this.tableToolbar.toolbarElement;
		
		if (isInTable) {
			toolbar.classList.add('table-context');
			// Enable all buttons
			toolbar.querySelectorAll('.tableToolbarCommandItem').forEach(button => {
				button.classList.remove('disabled');
			});
		} else {
			toolbar.classList.remove('table-context');
			// Disable table manipulation buttons (keep create table button enabled)
			const buttons = toolbar.querySelectorAll('.tableToolbarCommandItem');
			buttons.forEach((button, index) => {
				// Enable first button (Create Table), disable others
				if (index === 0) {
					button.classList.remove('disabled');
				} else {
					button.classList.add('disabled');
				}
			});
		}
	}

	destroy(): void {
		// Clear interval
		if (this.checkInterval) {
			clearInterval(this.checkInterval);
			this.checkInterval = null;
		}

		// Disconnect DOM observer
		if (this.domObserver) {
			this.domObserver.disconnect();
			this.domObserver = null;
		}

		// Clear all debounce timers
		this.debounceTimers.forEach((timer) => {
			window.clearTimeout(timer);
		});
		this.debounceTimers.clear();

		// Remove mouse click listener
		if (this.mouseClickListener) {
			document.removeEventListener('click', this.mouseClickListener);
			this.mouseClickListener = null;
		}

		// Clear observers
		this.observers.clear();

		// Destroy toolbar
		if (this.tableToolbar) {
			this.tableToolbar.destroy();
			this.tableToolbar = null;
		}

		// Reset all state
		this.lastCursorPosition = null;
		this.retryAttempts = 0;
		this.isCreatingToolbar = false;
		this.lastActiveFile = null;
		this.lastWorkspaceChangeTime = 0;
		this.toolbarInitialized = false;
		this.currentWorkspaceId = null;
		
		console.log('🧹 ToolbarManager destroyed and cleaned up');
	}

	// Public method to manually trigger toolbar update
	refresh(): void {
		this.recreateToolbarIfNeeded();
		// Only update context, don't check visibility unnecessarily
		if (this.tableToolbar) {
			this.updateToolbarContextOnly();
		}
	}

	// Debug method to get current status
	getDebugStatus(): object {
		const editingToolbar = document.querySelector('.editingToolbarTinyAesthetic');
		const workspaceLeaf = document.querySelector('.workspace-leaf-content');
		
		return {
			toolbarExists: !!this.tableToolbar,
			toolbarElementExists: !!(this.tableToolbar && this.tableToolbar.toolbarElement),
			toolbarInDOM: !!(this.tableToolbar && this.tableToolbar.toolbarElement && document.contains(this.tableToolbar.toolbarElement)),
			toolbarVisible: this.tableToolbar?.isVisible || false,
			editingToolbarExists: !!editingToolbar,
			workspaceLeafExists: !!workspaceLeaf,
			domObserverActive: !!this.domObserver,
			retryAttempts: this.retryAttempts,
			maxRetryAttempts: this.maxRetryAttempts,
			settingsEnabled: this.settings.enableTableToolbar,
			activeEditor: !!this.app.workspace.activeEditor,
			currentFile: this.app.workspace.activeEditor?.file?.path || 'none'
		};
	}

	// Debug method to force toolbar recreation
	forceRecreate(): void {
		console.log('🔧 Force recreating toolbar...');
		if (this.tableToolbar) {
			this.tableToolbar.destroy();
			this.tableToolbar = null;
		}
		
		this.retryAttempts = 0;
		this.attemptToolbarCreation();
	}
}