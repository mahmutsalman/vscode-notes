import * as vscode from 'vscode';
import * as path from 'path';
import { NotesProvider } from './providers/NotesProvider';
import { WebviewProvider } from './providers/WebviewProvider';
import { StorageService } from './services/StorageService';
import { ImageService } from './services/ImageService';
import { SearchService } from './services/SearchService';
import { NoteModel, NoteColor } from './models/Note';
import { NoteSortOrder, TagSortOrder } from './models/NoteIndex';

let storageService: StorageService;
let imageService: ImageService;
let searchService: SearchService;
let notesProvider: NotesProvider;
let webviewProvider: WebviewProvider;

export async function activate(context: vscode.ExtensionContext) {
    console.log('Notes extension is being activated');

    try {
        // Initialize services
        await initializeServices(context);
        
        // Register providers
        registerProviders(context);
        
        // Register commands
        registerCommands(context);
        
        // Set up event listeners
        setupEventListeners(context);
        
        console.log('Notes extension activated successfully');
        
        // Show welcome message for first-time users
        const hasShownWelcome = context.globalState.get('notes.hasShownWelcome', false);
        if (!hasShownWelcome) {
            await showWelcomeMessage(context);
        }
        
    } catch (error) {
        console.error('Failed to activate Notes extension:', error);
        vscode.window.showErrorMessage(`Failed to activate Notes extension: ${error}`);
    }
}

export function deactivate() {
    console.log('Notes extension is being deactivated');
}

async function initializeServices(context: vscode.ExtensionContext) {
    // Get workspace root
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        throw new Error('Notes extension requires an open workspace');
    }

    // Initialize services
    storageService = new StorageService(workspaceRoot);
    await storageService.initialize();
    
    imageService = new ImageService();
    
    searchService = new SearchService(storageService.getIndex());
    
    console.log('Services initialized successfully');
}

function registerProviders(context: vscode.ExtensionContext) {
    // Create and register the notes tree view provider
    notesProvider = new NotesProvider(storageService, searchService, context);
    vscode.window.registerTreeDataProvider('notes.notesView', notesProvider);
    
    // Create webview provider
    webviewProvider = new WebviewProvider(
        context,
        storageService,
        imageService,
        searchService
    );
    
    // Note: Removed WebviewPanelSerializer - using simpler file-like approach for split editor
    
    console.log('Providers registered successfully');
}

function registerCommands(context: vscode.ExtensionContext) {
    const commands = [
        // Core note operations
        vscode.commands.registerCommand('notes.newNote', async () => {
            try {
                await createNewNote();
            } catch (error) {
                console.error('Failed to create new note:', error);
                vscode.window.showErrorMessage(`Failed to create note: ${error}`);
            }
        }),
        
        vscode.commands.registerCommand('notes.editNote', async (treeItemOrNoteId?: any) => {
            try {
                // Handle both tree item (from context menu) and direct note ID
                let noteId: string | undefined;
                if (typeof treeItemOrNoteId === 'string') {
                    noteId = treeItemOrNoteId;
                } else if (treeItemOrNoteId && treeItemOrNoteId.noteId) {
                    noteId = treeItemOrNoteId.noteId;
                }
                await editNote(noteId);
            } catch (error) {
                console.error('Failed to edit note:', error);
                vscode.window.showErrorMessage(`Failed to edit note: ${error}`);
            }
        }),
        
        vscode.commands.registerCommand('notes.deleteNote', async (treeItemOrNoteId?: any) => {
            try {
                // Handle both tree item (from context menu) and direct note ID
                let noteId: string | undefined;
                if (typeof treeItemOrNoteId === 'string') {
                    noteId = treeItemOrNoteId;
                } else if (treeItemOrNoteId && treeItemOrNoteId.noteId) {
                    noteId = treeItemOrNoteId.noteId;
                }
                await deleteNote(noteId);
            } catch (error) {
                console.error('Failed to delete note:', error);
                vscode.window.showErrorMessage(`Failed to delete note: ${error}`);
            }
        }),
        
        // Image operations
        vscode.commands.registerCommand('notes.pasteImage', async () => {
            try {
                await pasteImageFromClipboard();
            } catch (error) {
                console.error('Failed to paste image:', error);
                vscode.window.showErrorMessage(`Failed to paste image: ${error}`);
            }
        }),
        
        vscode.commands.registerCommand('notes.quickPasteImage', async () => {
            try {
                await quickPasteImageToActiveNote();
            } catch (error) {
                console.error('Failed to quick paste image:', error);
                vscode.window.showErrorMessage(`Failed to paste image via F4: ${error}`);
            }
        }),

        vscode.commands.registerCommand('notes.cycleImageColor', async () => {
            console.log('🔥 Shift+F12 Command triggered: notes.cycleImageColor');
            try {
                await cycleImageColorInActiveNote();
            } catch (error) {
                console.error('Failed to cycle image color:', error);
                vscode.window.showErrorMessage(`Failed to cycle image color via Shift+F12: ${error}`);
            }
        }),
        
        // Search operations
        vscode.commands.registerCommand('notes.searchNotes', async () => {
            try {
                await searchNotes();
            } catch (error) {
                console.error('Failed to search notes:', error);
                vscode.window.showErrorMessage(`Failed to search notes: ${error}`);
            }
        }),
        
        vscode.commands.registerCommand('notes.searchByTag', async (tag?: string) => {
            try {
                await searchNotesByTag(tag);
            } catch (error) {
                console.error('Failed to search notes by tag:', error);
                vscode.window.showErrorMessage(`Failed to search notes by tag: ${error}`);
            }
        }),

        vscode.commands.registerCommand('notes.clearTagFilter', () => {
            try {
                notesProvider.clearTagFilter();
            } catch (error) {
                console.error('Failed to clear tag filter:', error);
                vscode.window.showErrorMessage(`Failed to clear tag filter: ${error}`);
            }
        }),

        vscode.commands.registerCommand('notes.filterTags', async () => {
            try {
                await filterTags();
            } catch (error) {
                console.error('Failed to filter tags:', error);
                vscode.window.showErrorMessage(`Failed to filter tags: ${error}`);
            }
        }),

        vscode.commands.registerCommand('notes.clearTagSearch', () => {
            try {
                notesProvider.clearTagSearchText();
            } catch (error) {
                console.error('Failed to clear tag search:', error);
                vscode.window.showErrorMessage(`Failed to clear tag search: ${error}`);
            }
        }),

        // Code linking
        vscode.commands.registerCommand('notes.linkToCode', async () => {
            try {
                await linkToCode();
            } catch (error) {
                console.error('Failed to link to code:', error);
                vscode.window.showErrorMessage(`Failed to link to code: ${error}`);
            }
        }),
        
        // Tree view operations
        vscode.commands.registerCommand('notes.refreshNotes', async () => {
            try {
                await refreshNotes();
            } catch (error) {
                console.error('Failed to refresh notes:', error);
                vscode.window.showErrorMessage(`Failed to refresh notes: ${error}`);
            }
        }),

        vscode.commands.registerCommand('notes.sortAllNotes', async (order?: NoteSortOrder) => {
            try {
                console.log('[notes] Command notes.sortAllNotes invoked', { order });
                // Validate that order is actually a valid NoteSortOrder value
                const isValidOrder = order && (order === 'created' || order === 'updated');
                let targetOrder = isValidOrder ? order : undefined;

                if (!targetOrder) {
                    const currentOrder = notesProvider.getAllNotesSortOrder();
                    const picks: Array<vscode.QuickPickItem & { order: NoteSortOrder }> = [
                        {
                            label: 'Last updated (newest first)',
                            description: currentOrder === 'updated' ? 'Current' : undefined,
                            picked: currentOrder === 'updated',
                            order: 'updated'
                        },
                        {
                            label: 'Creation date (newest first)',
                            description: currentOrder === 'created' ? 'Current' : undefined,
                            picked: currentOrder === 'created',
                            order: 'created'
                        }
                    ];

                    const selection = await vscode.window.showQuickPick(picks, {
                        placeHolder: 'Choose how to sort notes',
                        title: 'Sort Notes'
                    });

                    if (!selection) {
                        console.log('[notes] notes.sortAllNotes cancelled by user');
                        return;
                    }

                    targetOrder = selection.order;
                    console.log('[notes] notes.sortAllNotes selection', { selectedOrder: targetOrder });
                }

                console.log('[notes] notes.sortAllNotes applying order', {
                    currentOrder: notesProvider.getAllNotesSortOrder(),
                    targetOrder
                });
                notesProvider.setAllNotesSortOrder(targetOrder);
                console.log('[notes] notes.sortAllNotes applied', {
                    appliedOrder: targetOrder,
                    newCurrentOrder: notesProvider.getAllNotesSortOrder()
                });
            } catch (error) {
                console.error('Failed to update notes sort order:', error);
                vscode.window.showErrorMessage(`Failed to update sort order: ${error}`);
            }
        }),

        vscode.commands.registerCommand('notes.sortTags', async () => {
            try {
                await sortTags();
            } catch (error) {
                console.error('Failed to sort tags:', error);
                vscode.window.showErrorMessage(`Failed to sort tags: ${error}`);
            }
        }),

        // Color management
        vscode.commands.registerCommand('notes.setNoteColor', async (treeItemOrNoteId?: any) => {
            try {
                // Handle both tree item (from context menu) and direct note ID
                let noteId: string | undefined;
                if (typeof treeItemOrNoteId === 'string') {
                    noteId = treeItemOrNoteId;
                } else if (treeItemOrNoteId && treeItemOrNoteId.noteId) {
                    noteId = treeItemOrNoteId.noteId;
                }
                await setNoteColor(noteId);
            } catch (error) {
                console.error('Failed to set note color:', error);
                vscode.window.showErrorMessage(`Failed to set note color: ${error}`);
            }
        }),

        // Internal commands
        vscode.commands.registerCommand('notes.openNote', async (noteId: string) => {
            try {
                await openNote(noteId);
            } catch (error) {
                console.error('Failed to open note:', error);
                vscode.window.showErrorMessage(`Failed to open note: ${error}`);
            }
        })
    ];
    
    // Register all commands
    commands.forEach(command => context.subscriptions.push(command));
    
    console.log('Commands registered successfully');
}

function setupEventListeners(context: vscode.ExtensionContext) {
    // Listen for workspace changes
    const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(async () => {
        try {
            await initializeServices(context);
            notesProvider.refresh();
        } catch (error) {
            console.error('Failed to handle workspace change:', error);
        }
    });
    
    // Listen for file system changes in notes directory
    const notesWatcher = vscode.workspace.createFileSystemWatcher('**/.notes/**');
    
    notesWatcher.onDidCreate(() => notesProvider.refresh());
    notesWatcher.onDidChange(() => notesProvider.refresh());
    notesWatcher.onDidDelete(() => notesProvider.refresh());
    
    context.subscriptions.push(workspaceWatcher, notesWatcher);
    
    console.log('Event listeners set up successfully');
}

async function createNewNote() {
    const title = await vscode.window.showInputBox({
        prompt: 'Enter note title',
        placeHolder: 'My new note'
    });
    
    if (!title) {
        return;
    }
    
    const note = new NoteModel({ title });
    await storageService.saveNote(note);
    
    // Update search service
    searchService.updateIndex(storageService.getIndex());
    
    // Refresh tree view
    notesProvider.refresh();
    
    // Open the note for editing
    await openNote(note.id);
    
    vscode.window.showInformationMessage(`Note "${title}" created successfully`);
}

async function editNote(noteId?: string) {
    if (!noteId) {
        // Show quick pick to select note
        const notes = await storageService.getAllNotes();
        if (notes.length === 0) {
            vscode.window.showInformationMessage('No notes found');
            return;
        }
        
        const items = notes.map(note => ({
            label: note.title,
            description: note.tags.join(', '),
            detail: new Date(note.updated).toLocaleString(),
            noteId: note.id
        }));
        
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a note to edit'
        });
        
        if (!selected) {
            return;
        }
        
        noteId = selected.noteId;
    }
    
    await openNote(noteId);
}

async function deleteNote(noteId?: string) {
    if (!noteId) {
        vscode.window.showErrorMessage('No note selected for deletion');
        return;
    }
    
    const note = await storageService.loadNote(noteId);
    if (!note) {
        vscode.window.showErrorMessage('Note not found');
        return;
    }
    
    const answer = await vscode.window.showWarningMessage(
        `Are you sure you want to delete "${note.title}"?`,
        'Yes',
        'No'
    );
    
    if (answer === 'Yes') {
        await storageService.deleteNote(noteId);
        searchService.updateIndex(storageService.getIndex());
        notesProvider.refresh();
        vscode.window.showInformationMessage(`Note "${note.title}" deleted successfully`);
    }
}

async function pasteImageFromClipboard() {
    try {
        const imageBuffer = await imageService.processClipboardImage();
        if (!imageBuffer) {
            vscode.window.showInformationMessage('No image found in clipboard');
            return;
        }
        
        if (!await imageService.validateImage(imageBuffer)) {
            vscode.window.showErrorMessage('Invalid or unsupported image format');
            return;
        }
        
        // For now, create a new note with the image
        // In a full implementation, this would open a dialog to select an existing note
        const title = await vscode.window.showInputBox({
            prompt: 'Enter note title for the image',
            placeHolder: 'Screenshot note'
        });
        
        if (!title) {
            return;
        }
        
        const note = new NoteModel({ title });
        const noteImage = await imageService.createNoteImage(imageBuffer, note.id);
        
        // Save the image files
        const notesDir = path.join(getWorkspaceRoot()!, '.notes', 'images', note.id);
        await storageService.saveImage(note.id, imageBuffer, noteImage.filename);
        
        // Create thumbnail
        const thumbnailBuffer = await imageService.createThumbnail(imageBuffer);
        await storageService.saveImage(note.id, thumbnailBuffer, `thumb-${Date.now()}.jpg`);
        
        // Add image to note
        note.addImage(noteImage);
        await storageService.saveNote(note);
        
        searchService.updateIndex(storageService.getIndex());
        notesProvider.refresh();
        
        vscode.window.showInformationMessage(`Image note "${title}" created successfully`);
        
    } catch (error) {
        console.error('Failed to paste image:', error);
        vscode.window.showErrorMessage(`Failed to paste image: ${error}`);
    }
}

async function searchNotes() {
    const query = await vscode.window.showInputBox({
        prompt: 'Enter search query',
        placeHolder: 'Search notes...'
    });
    
    if (!query) {
        return;
    }
    
    const results = searchService.search(query, { limit: 20 });
    
    if (results.length === 0) {
        vscode.window.showInformationMessage('No notes found matching your search');
        return;
    }
    
    const items = results.map(result => ({
        label: result.note.title,
        description: result.note.tags.join(', '),
        detail: `Score: ${(result.score * 100).toFixed(0)}% - ${new Date(result.note.updated).toLocaleString()}`,
        noteId: result.note.id
    }));
    
    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a note to open'
    });
    
    if (selected) {
        await openNote(selected.noteId);
    }
}

async function searchNotesByTag(tag?: string) {
    if (!tag || typeof tag !== 'string') {
        return;
    }

    notesProvider.setTagFilter(tag);

    const results = searchService.searchByTag(tag);

    if (results.length === 0) {
        vscode.window.showInformationMessage(`No notes found with tag "${tag}"`);
        return;
    }

    const items = results.map(result => ({
        label: result.note.title,
        description: result.note.tags.join(', '),
        detail: new Date(result.note.updated).toLocaleString(),
        noteId: result.note.id
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `Notes tagged with "${tag}"`
    });

    if (selected) {
        await openNote(selected.noteId);
    }
}

async function filterTags() {
    const currentFilter = notesProvider.getTagSearchText() ?? '';
    const input = await vscode.window.showInputBox({
        prompt: 'Filter tags',
        placeHolder: 'Type to show tags that include this text',
        value: currentFilter,
        ignoreFocusOut: true
    });

    if (input === undefined) {
        return;
    }

    const trimmed = input.trim();
    if (trimmed.length === 0) {
        notesProvider.clearTagSearchText();
        return;
    }

    notesProvider.setTagSearchText(trimmed);
}

async function sortTags() {
    const currentOrder = notesProvider.getTagSortOrder();
    const picks: Array<vscode.QuickPickItem & { order: TagSortOrder }> = [
        {
            label: 'Most used',
            description: currentOrder === 'usage' ? 'Current' : undefined,
            order: 'usage'
        },
        {
            label: 'Oldest first',
            description: currentOrder === 'created' ? 'Current' : undefined,
            detail: 'Tags sorted by the earliest time they were used',
            order: 'created'
        },
        {
            label: 'Last used',
            description: currentOrder === 'recent' ? 'Current' : undefined,
            detail: 'Tags sorted by most recent usage',
            order: 'recent'
        }
    ];

    const selection = await vscode.window.showQuickPick(picks, {
        placeHolder: 'Choose how to sort tags',
        title: 'Sort Tags'
    });

    if (!selection) {
        console.log('[notes] notes.sortTags cancelled by user');
        return;
    }

    notesProvider.setTagSortOrder(selection.order);
    console.log('[notes] notes.sortTags applied', { appliedOrder: selection.order });
}

async function linkToCode() {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        vscode.window.showErrorMessage('No active editor to link to');
        return;
    }
    
    const document = activeEditor.document;
    const selection = activeEditor.selection;
    const line = selection.start.line + 1; // VS Code uses 0-based line numbers
    
    // Get workspace-relative path
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        vscode.window.showErrorMessage('No workspace root found');
        return;
    }
    
    const relativePath = path.relative(workspaceRoot, document.fileName);
    
    // Show notes to link to
    const notes = await storageService.getAllNotes();
    if (notes.length === 0) {
        vscode.window.showInformationMessage('No notes found. Create a note first.');
        return;
    }
    
    const items = notes.map(note => ({
        label: note.title,
        description: note.tags.join(', '),
        detail: new Date(note.updated).toLocaleString(),
        noteId: note.id
    }));
    
    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a note to link to this code'
    });
    
    if (!selected) {
        return;
    }
    
    const note = await storageService.loadNote(selected.noteId);
    if (!note) {
        vscode.window.showErrorMessage('Note not found');
        return;
    }
    
    // Add link to file
    note.linkToFile({
        path: relativePath,
        line: line,
        description: `Line ${line} in ${path.basename(document.fileName)}`
    });
    
    await storageService.saveNote(note);
    searchService.updateIndex(storageService.getIndex());
    notesProvider.refresh();
    
    vscode.window.showInformationMessage(`Linked "${note.title}" to ${relativePath}:${line}`);
}

async function refreshNotes() {
    try {
        // Re-initialize storage to pick up external changes
        await storageService.initialize();
        searchService.updateIndex(storageService.getIndex());
        notesProvider.refresh();
        vscode.window.showInformationMessage('Notes refreshed successfully');
    } catch (error) {
        console.error('Failed to refresh notes:', error);
        vscode.window.showErrorMessage(`Failed to refresh notes: ${error}`);
    }
}

async function openNote(noteId: string) {
    // Open note in rich webview editor
    await webviewProvider.openNote(noteId);
}

function getWorkspaceRoot(): string | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    return workspaceFolders && workspaceFolders.length > 0 
        ? workspaceFolders[0].uri.fsPath 
        : undefined;
}

async function quickPasteImageToActiveNote() {
    try {
        // Check if clipboard has image data first
        const imageBuffer = await imageService.processClipboardImage();
        if (!imageBuffer) {
            vscode.window.showInformationMessage('No image found in clipboard');
            return;
        }

        if (!await imageService.validateImage(imageBuffer)) {
            vscode.window.showErrorMessage('Invalid or unsupported image format');
            return;
        }

        // Get all active webview panels and find notes editor
        const activeNotePanel = webviewProvider.getActiveNotePanel();
        if (!activeNotePanel) {
            vscode.window.showWarningMessage('F4 hotkey works only when a note editor is active. Open a note first.');
            return;
        }

        // Send message to webview to trigger image paste (simulates clicking "Add Image")
        activeNotePanel.webview.postMessage({
            command: 'addImage',
            data: { source: 'f4-hotkey' }
        });

        console.log('F4 hotkey: Image paste message sent to webview');

    } catch (error) {
        console.error('Failed to process clipboard image:', error);
        vscode.window.showErrorMessage(`Failed to process clipboard image: ${error}`);
    }
}

async function cycleImageColorInActiveNote() {
    console.log('🎨 Global Shift+F12 cycleImageColorInActiveNote function called');
    try {
        // Get all active webview panels and find notes editor
        console.log('🔍 Looking for active note panel...');
        const activeNotePanel = webviewProvider.getActiveNotePanel();
        
        if (!activeNotePanel) {
            console.log('❌ No active note panel found - attempting global functionality');
            
            // Global functionality: Try to find most recently opened/edited note
            const allNotes = await storageService.getAllNotes();
            if (allNotes.length === 0) {
                vscode.window.showWarningMessage('No notes found. Create a note with images first.', 'Create Note').then(selection => {
                    if (selection === 'Create Note') {
                        vscode.commands.executeCommand('notes.newNote');
                    }
                });
                return;
            }

            // Sort by most recently updated
            const recentNotes = allNotes.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());
            
            // Find the most recent note that has images
            const noteWithImages = recentNotes.find(note => note.images && note.images.length > 0);
            
            if (!noteWithImages) {
                vscode.window.showInformationMessage('No notes with images found for color cycling.', 'Open Note', 'Create Note').then(selection => {
                    if (selection === 'Open Note') {
                        vscode.commands.executeCommand('notes.editNote');
                    } else if (selection === 'Create Note') {
                        vscode.commands.executeCommand('notes.newNote');
                    }
                });
                return;
            }

            // Apply color cycling logic directly to the most recent image
            await performGlobalColorCycling(noteWithImages);
            return;
        }

        console.log('✅ Active note panel found, sending message to webview');
        // Send message to webview to trigger color cycling (existing behavior)
        activeNotePanel.webview.postMessage({
            command: 'cycleImageColor',
            data: { source: 'f12-hotkey' }
        });

        console.log('📤 Shift+F12 hotkey: Color cycling message sent to webview');

    } catch (error) {
        console.error('❌ Failed to cycle image color:', error);
        vscode.window.showErrorMessage(`Failed to cycle image color: ${error}`);
    }
}

async function performGlobalColorCycling(note: NoteModel): Promise<void> {
    console.log('🌍 Performing global color cycling for note:', note.title);
    
    if (!note.images || note.images.length === 0) {
        vscode.window.showWarningMessage('No images found in the most recent note.');
        return;
    }

    // Get the last image (most recent)
    const lastImage = note.images[note.images.length - 1];
    const colorCycle: (undefined | 'green' | 'blue' | 'purple')[] = [undefined, 'green', 'blue', 'purple'];
    const colorNames = ['None', 'Green', 'Blue', 'Purple'];
    
    const currentColorIndex = colorCycle.indexOf(lastImage.color);
    const nextColorIndex = (currentColorIndex + 1) % colorCycle.length;
    const nextColor = colorCycle[nextColorIndex];
    const nextColorName = colorNames[nextColorIndex];

    console.log(`🎨 Global cycling: ${lastImage.color || 'none'} → ${nextColor || 'none'}`);

    // Update the image color in the note
    const success = note.updateImageColor(lastImage.id, nextColor);
    if (!success) {
        vscode.window.showErrorMessage('Failed to update image color - image not found.');
        return;
    }

    // Save the updated note
    await storageService.saveNote(note);
    
    // Update search index
    searchService.updateIndex(storageService.getIndex());
    
    // Refresh tree view
    notesProvider.refresh();

    // Show notification with color name
    const cycleCounts = ['1st', '2nd', '3rd'];
    const cycleText = nextColorIndex < cycleCounts.length ? `${cycleCounts[nextColorIndex]} cycle: ` : '';
    
    vscode.window.showInformationMessage(
        `🎨 ${cycleText}${nextColorName} color assigned to image in "${note.title}"`
    );
    
    console.log(`✅ Global color cycling completed: ${nextColorName} assigned to image in "${note.title}"`);
}

async function setNoteColor(noteId?: string) {
    if (!noteId) {
        vscode.window.showErrorMessage('No note selected for color assignment');
        return;
    }

    const note = await storageService.loadNote(noteId);
    if (!note) {
        vscode.window.showErrorMessage('Note not found');
        return;
    }

    // Define color options with icons and descriptions
    interface ColorOption extends vscode.QuickPickItem {
        color?: NoteColor;
    }

    const colorOptions: ColorOption[] = [
        {
            label: 'Default',
            description: 'No color (default theme)',
            color: undefined
        },
        {
            label: '🔴 Red',
            description: 'High priority or urgent notes',
            color: 'red'
        },
        {
            label: '🔵 Blue',
            description: 'Information or reference notes',
            color: 'blue'
        },
        {
            label: '🟢 Green',
            description: 'Completed or positive notes',
            color: 'green'
        },
        {
            label: '🟣 Purple',
            description: 'Creative or brainstorming notes',
            color: 'purple'
        },
        {
            label: '🟠 Orange',
            description: 'Ideas or inspiration notes',
            color: 'orange'
        },
        {
            label: '🟡 Yellow',
            description: 'Warnings or reminders',
            color: 'yellow'
        },
        {
            label: '🩷 Pink',
            description: 'Personal or favorite notes',
            color: 'pink'
        },
        {
            label: '🩵 Cyan',
            description: 'Cool or technical notes',
            color: 'cyan'
        }
    ];

    // Mark current color as selected
    const currentColorOption = colorOptions.find(option => option.color === note.color);
    if (currentColorOption) {
        currentColorOption.description += ' (current)';
        currentColorOption.picked = true;
    } else {
        colorOptions[0].description += ' (current)';
        colorOptions[0].picked = true;
    }

    const selectedOption = await vscode.window.showQuickPick(colorOptions, {
        placeHolder: `Choose a color for "${note.title}"`,
        title: 'Set Note Color'
    });

    if (!selectedOption) {
        return;
    }

    // Update note color
    note.setColor(selectedOption.color);
    await storageService.saveNote(note);

    // Update search index
    searchService.updateIndex(storageService.getIndex());

    // Refresh tree view
    notesProvider.refresh();

    const colorName = selectedOption.color ? selectedOption.color : 'default';
    vscode.window.showInformationMessage(`Note "${note.title}" color set to ${colorName}`);
}

async function showWelcomeMessage(context: vscode.ExtensionContext) {
    const result = await vscode.window.showInformationMessage(
        'Welcome to Notes! Create your first note to get started.',
        'Create Note',
        'Learn More'
    );
    
    if (result === 'Create Note') {
        await createNewNote();
    } else if (result === 'Learn More') {
        vscode.env.openExternal(vscode.Uri.parse('https://github.com/notes-extension/notes'));
    }
    
    await context.globalState.update('notes.hasShownWelcome', true);
}
