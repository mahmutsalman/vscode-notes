import * as vscode from 'vscode';
import * as path from 'path';
import { StorageService } from '../services/StorageService';
import { ImageService } from '../services/ImageService';
import { SearchService } from '../services/SearchService';
import { NoteModel } from '../models/Note';

export class WebviewProvider {
    private static readonly viewType = 'notes.editor';
    private panels: Map<string, vscode.WebviewPanel> = new Map();

    constructor(
        private context: vscode.ExtensionContext,
        private storageService: StorageService,
        private imageService: ImageService,
        private searchService: SearchService
    ) {
        this.registerCommands();
    }

    private registerCommands() {
        // Register command to open note in webview
        const openNoteCommand = vscode.commands.registerCommand('notes.openNoteInEditor', async (noteId: string) => {
            await this.openNote(noteId);
        });

        this.context.subscriptions.push(openNoteCommand);
    }

    public async openNote(noteId: string): Promise<void> {
        // Check if panel already exists for this note
        const existingPanel = this.panels.get(noteId);
        if (existingPanel) {
            existingPanel.reveal();
            return;
        }

        // Load the note
        const note = await this.storageService.loadNote(noteId);
        if (!note) {
            vscode.window.showErrorMessage('Note not found');
            return;
        }

        // Create new webview panel
        const panel = vscode.window.createWebviewPanel(
            WebviewProvider.viewType,
            `Edit: ${note.title}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath, 'media')),
                    vscode.Uri.file(path.join(this.getWorkspaceRoot() || '', '.notes'))
                ]
            }
        );

        // Set the webview content
        panel.webview.html = this.getWebviewContent(panel.webview, note);

        // Handle messages from webview
        panel.webview.onDidReceiveMessage(
            async (message) => {
                await this.handleWebviewMessage(message, noteId, panel);
            },
            undefined,
            this.context.subscriptions
        );

        // Clean up when panel is disposed
        panel.onDidDispose(() => {
            this.panels.delete(noteId);
        });

        // Store panel reference
        this.panels.set(noteId, panel);
    }

    private async handleWebviewMessage(message: any, noteId: string, panel: vscode.WebviewPanel): Promise<void> {
        switch (message.command) {
            case 'saveNote':
                await this.saveNote(message.data, noteId, panel);
                break;
            case 'deleteNote':
                await this.deleteNote(noteId, panel);
                break;
            case 'addImage':
                await this.addImage(message.data, noteId, panel);
                break;
            case 'removeImage':
                await this.removeImage(message.data.imageId, noteId, panel);
                break;
            case 'linkToCode':
                await this.linkToCode(message.data, noteId);
                break;
            case 'searchTags':
                await this.searchTags(message.data.query, panel);
                break;
            default:
                console.warn('Unknown webview message:', message);
        }
    }

    private async saveNote(data: any, noteId: string, panel: vscode.WebviewPanel): Promise<void> {
        try {
            const note = await this.storageService.loadNote(noteId);
            if (!note) {
                throw new Error('Note not found');
            }

            // Update note properties
            note.update({
                title: data.title || 'Untitled Note',
                content: data.content || '',
                tags: data.tags || [],
                isPinned: data.isPinned || false
            });

            // Save the note
            await this.storageService.saveNote(note);

            // Update search index
            this.searchService.updateIndex(this.storageService.getIndex());

            // Update panel title
            panel.title = `Edit: ${note.title}`;

            // Send success message to webview
            panel.webview.postMessage({
                command: 'saveSuccess',
                data: { noteId: note.id, timestamp: note.updated }
            });

            vscode.window.showInformationMessage(`Note "${note.title}" saved successfully`);

        } catch (error) {
            console.error('Failed to save note:', error);
            panel.webview.postMessage({
                command: 'saveError',
                data: { error: (error as Error).toString() }
            });
            vscode.window.showErrorMessage(`Failed to save note: ${error}`);
        }
    }

    private async deleteNote(noteId: string, panel: vscode.WebviewPanel): Promise<void> {
        try {
            const note = await this.storageService.loadNote(noteId);
            if (!note) {
                throw new Error('Note not found');
            }

            const answer = await vscode.window.showWarningMessage(
                `Are you sure you want to delete "${note.title}"?`,
                'Yes',
                'No'
            );

            if (answer === 'Yes') {
                await this.storageService.deleteNote(noteId);
                this.searchService.updateIndex(this.storageService.getIndex());
                
                // Close the panel
                panel.dispose();
                
                vscode.window.showInformationMessage(`Note "${note.title}" deleted successfully`);
            }

        } catch (error) {
            console.error('Failed to delete note:', error);
            vscode.window.showErrorMessage(`Failed to delete note: ${error}`);
        }
    }

    private async addImage(data: any, noteId: string, panel: vscode.WebviewPanel): Promise<void> {
        try {
            // For now, we'll handle clipboard paste
            // In a full implementation, this could handle file uploads too
            const imageBuffer = await this.imageService.processClipboardImage();
            if (!imageBuffer) {
                vscode.window.showInformationMessage('No image found in clipboard');
                return;
            }

            if (!await this.imageService.validateImage(imageBuffer)) {
                vscode.window.showErrorMessage('Invalid or unsupported image format');
                return;
            }

            const note = await this.storageService.loadNote(noteId);
            if (!note) {
                throw new Error('Note not found');
            }

            // Create note image
            const noteImage = await this.imageService.createNoteImage(
                imageBuffer, 
                noteId, 
                data.caption
            );

            // Save image files
            await this.storageService.saveImage(noteId, imageBuffer, noteImage.filename);
            
            // Create and save thumbnail
            const thumbnailBuffer = await this.imageService.createThumbnail(imageBuffer);
            const thumbnailFilename = path.basename(noteImage.thumbnail);
            await this.storageService.saveImage(noteId, thumbnailBuffer, thumbnailFilename);

            // Add image to note
            note.addImage(noteImage);
            await this.storageService.saveNote(note);

            // Update search index
            this.searchService.updateIndex(this.storageService.getIndex());

            // Prepare image data with webview paths
            const imageDataForWebview = {
                ...noteImage,
                webviewPath: panel.webview.asWebviewUri(
                    vscode.Uri.file(this.storageService.getImagePath(noteId, noteImage.filename))
                ).toString(),
                thumbnailPath: panel.webview.asWebviewUri(
                    vscode.Uri.file(this.storageService.getImagePath(noteId, path.basename(noteImage.thumbnail)))
                ).toString()
            };

            // Send success message to webview
            panel.webview.postMessage({
                command: 'imageAdded',
                data: { image: imageDataForWebview }
            });

            vscode.window.showInformationMessage('Image added successfully');

        } catch (error) {
            console.error('Failed to add image:', error);
            panel.webview.postMessage({
                command: 'imageError',
                data: { error: (error as Error).toString() }
            });
            vscode.window.showErrorMessage(`Failed to add image: ${error}`);
        }
    }

    private async removeImage(imageId: string, noteId: string, panel: vscode.WebviewPanel): Promise<void> {
        try {
            const note = await this.storageService.loadNote(noteId);
            if (!note) {
                throw new Error('Note not found');
            }

            const imageIndex = note.images.findIndex(img => img.id === imageId);
            if (imageIndex === -1) {
                throw new Error('Image not found in note');
            }

            const image = note.images[imageIndex];

            // Delete image files
            await this.storageService.deleteImage(noteId, image.filename);
            await this.storageService.deleteImage(noteId, path.basename(image.thumbnail));

            // Remove image from note
            note.removeImage(imageId);
            await this.storageService.saveNote(note);

            // Update search index
            this.searchService.updateIndex(this.storageService.getIndex());

            // Send success message to webview
            panel.webview.postMessage({
                command: 'imageRemoved',
                data: { imageId }
            });

            vscode.window.showInformationMessage('Image removed successfully');

        } catch (error) {
            console.error('Failed to remove image:', error);
            panel.webview.postMessage({
                command: 'imageError',
                data: { error: (error as Error).toString() }
            });
            vscode.window.showErrorMessage(`Failed to remove image: ${error}`);
        }
    }

    private async linkToCode(data: any, noteId: string): Promise<void> {
        try {
            const note = await this.storageService.loadNote(noteId);
            if (!note) {
                throw new Error('Note not found');
            }

            // Get workspace-relative path
            const workspaceRoot = this.getWorkspaceRoot();
            if (!workspaceRoot) {
                throw new Error('No workspace root found');
            }

            const relativePath = data.filePath.startsWith(workspaceRoot)
                ? path.relative(workspaceRoot, data.filePath)
                : data.filePath;

            // Add link to file
            note.linkToFile({
                path: relativePath,
                line: data.line,
                description: data.description || `Line ${data.line} in ${path.basename(data.filePath)}`
            });

            await this.storageService.saveNote(note);
            this.searchService.updateIndex(this.storageService.getIndex());

            vscode.window.showInformationMessage(`Linked to ${relativePath}:${data.line}`);

        } catch (error) {
            console.error('Failed to link to code:', error);
            vscode.window.showErrorMessage(`Failed to link to code: ${error}`);
        }
    }

    private async searchTags(query: string, panel: vscode.WebviewPanel): Promise<void> {
        try {
            const suggestions = this.searchService.getTagSuggestions(query);
            panel.webview.postMessage({
                command: 'tagSuggestions',
                data: { suggestions }
            });
        } catch (error) {
            console.error('Failed to search tags:', error);
        }
    }

    private getWebviewContent(webview: vscode.Webview, note: NoteModel): string {
        // Get URIs for resources
        const styleUri = webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'media', 'styles.css'))
        );
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'media', 'noteEditor.js'))
        );
        const iconUri = webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'media', 'icons'))
        );

        // Convert note data for webview
        const noteData = {
            ...note.toJSON(),
            images: note.images.map(img => ({
                ...img,
                webviewPath: webview.asWebviewUri(
                    vscode.Uri.file(this.storageService.getImagePath(note.id, img.filename))
                ).toString(),
                thumbnailPath: webview.asWebviewUri(
                    vscode.Uri.file(this.storageService.getImagePath(note.id, path.basename(img.thumbnail)))
                ).toString()
            }))
        };

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Edit Note</title>
            <link href="${styleUri}" rel="stylesheet">
        </head>
        <body>
            <div class="editor-container">
                <div class="toolbar">
                    <button id="saveBtn" class="btn btn-primary">
                        <img src="${iconUri}/save.svg" alt="Save" /> Save
                    </button>
                    <button id="deleteBtn" class="btn btn-danger">
                        <img src="${iconUri}/delete.svg" alt="Delete" /> Delete
                    </button>
                    <button id="addImageBtn" class="btn btn-secondary">
                        <img src="${iconUri}/image.svg" alt="Add Image" /> Add Image
                    </button>
                    <button id="linkCodeBtn" class="btn btn-secondary">
                        <img src="${iconUri}/link-to-code.svg" alt="Link to Code" /> Link to Code
                    </button>
                    <label class="pin-checkbox">
                        <input type="checkbox" id="pinnedCheckbox" ${note.isPinned ? 'checked' : ''} />
                        📌 Pinned
                    </label>
                </div>
                
                <div class="editor-content">
                    <div class="note-meta">
                        <input type="text" id="noteTitle" class="title-input" value="${this.escapeHtml(note.title)}" placeholder="Note title..." />
                        <div class="meta-info">
                            <span>Created: ${new Date(note.created).toLocaleString()}</span>
                            <span>Updated: ${new Date(note.updated).toLocaleString()}</span>
                        </div>
                    </div>
                    
                    <div class="tags-section">
                        <div class="tags-input-container">
                            <input type="text" id="tagsInput" placeholder="Add tags..." />
                            <div class="tags-container" id="tagsContainer">
                                ${note.tags.map(tag => `<span class="tag">${this.escapeHtml(tag)} <span class="remove-tag" data-tag="${this.escapeHtml(tag)}">×</span></span>`).join('')}
                            </div>
                        </div>
                    </div>
                    
                    <div class="main-editor">
                        <div class="text-editor">
                            <textarea id="contentEditor" placeholder="Write your note here...">${this.escapeHtml(note.content)}</textarea>
                        </div>
                        
                        <div class="image-gallery" id="imageGallery">
                            ${this.renderImageGallery(noteData.images)}
                        </div>
                    </div>
                    
                    <div class="linked-files" id="linkedFiles">
                        ${this.renderLinkedFiles(note.linkedFiles)}
                    </div>
                </div>
            </div>
            
            <script>
                // Global variables for the editor
                window.noteData = ${JSON.stringify(noteData)};
                window.iconUri = '${iconUri}';
                console.log('Webview globals set:', { noteData: window.noteData, iconUri: window.iconUri });
            </script>
            <script src="${scriptUri}"></script>
        </body>
        </html>`;
    }

    private renderImageGallery(images: any[]): string {
        if (images.length === 0) {
            return '<p class="empty-gallery">No images yet. Click "Add Image" or paste from clipboard.</p>';
        }

        return `
            <h3>Images (${images.length})</h3>
            <div class="images-grid">
                ${images.map((img, index) => `
                    <div class="image-item" data-image-id="${img.id}">
                        <div class="image-counter">${index + 1}/${images.length}</div>
                        <img src="${img.thumbnailPath}" alt="${this.escapeHtml(img.caption || 'Note image')}" class="thumbnail" data-full-image="${img.webviewPath}" />
                        <div class="image-controls">
                            <button class="btn-small btn-danger remove-image" data-image-id="${img.id}">
                                Remove
                            </button>
                        </div>
                        ${img.caption ? `<p class="image-caption">${this.escapeHtml(img.caption)}</p>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }

    private renderLinkedFiles(linkedFiles: any[]): string {
        if (linkedFiles.length === 0) {
            return '';
        }

        return `
            <div class="linked-files-section">
                <h3>Linked Files (${linkedFiles.length})</h3>
                <div class="linked-files-list">
                    ${linkedFiles.map(file => `
                        <div class="linked-file">
                            <span class="file-path">${this.escapeHtml(file.path)}</span>
                            ${file.line ? `<span class="file-line">:${file.line}</span>` : ''}
                            ${file.description ? `<span class="file-description">${this.escapeHtml(file.description)}</span>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    private escapeHtml(text: string): string {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    private getWorkspaceRoot(): string | undefined {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        return workspaceFolders && workspaceFolders.length > 0 
            ? workspaceFolders[0].uri.fsPath 
            : undefined;
    }

    public getActiveNotePanel(): vscode.WebviewPanel | undefined {
        // Find the most recently focused panel (last one in the map is usually the active one)
        const panelEntries = Array.from(this.panels.entries());
        if (panelEntries.length === 0) {
            return undefined;
        }

        // Check if any panel is currently visible/active
        for (const [, panel] of panelEntries) {
            if (panel.active) {
                return panel;
            }
        }

        // If no active panel found, return the last opened one
        return panelEntries[panelEntries.length - 1][1];
    }
}