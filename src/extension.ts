import * as vscode from 'vscode';
import * as path from 'path';
import { NotesProvider } from './providers/NotesProvider';
import { WebviewProvider } from './providers/WebviewProvider';
import { StorageService } from './services/StorageService';
import { ImageService } from './services/ImageService';
import { SearchService } from './services/SearchService';
import { NoteModel } from './models/Note';

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
    
    // Create and register the webview provider
    webviewProvider = new WebviewProvider(
        context,
        storageService,
        imageService,
        searchService
    );
    
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
        
        vscode.commands.registerCommand('notes.editNote', async (noteId?: string) => {
            try {
                await editNote(noteId);
            } catch (error) {
                console.error('Failed to edit note:', error);
                vscode.window.showErrorMessage(`Failed to edit note: ${error}`);
            }
        }),
        
        vscode.commands.registerCommand('notes.deleteNote', async (noteId?: string) => {
            try {
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
        
        // Search operations
        vscode.commands.registerCommand('notes.searchNotes', async () => {
            try {
                await searchNotes();
            } catch (error) {
                console.error('Failed to search notes:', error);
                vscode.window.showErrorMessage(`Failed to search notes: ${error}`);
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