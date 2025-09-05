import * as vscode from 'vscode';
import * as path from 'path';
import { StorageService } from '../services/StorageService';
import { SearchService } from '../services/SearchService';
import { NoteIndexEntry } from '../models/NoteIndex';

export class NotesProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(
        private storageService: StorageService,
        private searchService: SearchService,
        private context: vscode.ExtensionContext
    ) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeItem): Promise<TreeItem[]> {
        if (!element) {
            // Root level - show main categories
            return this.getRootItems();
        }

        switch (element.contextValue) {
            case 'pinnedNotesContainer':
                return this.getPinnedNotes();
            case 'recentTagsContainer':
                return this.getRecentTags();
            case 'allNotesContainer':
                return this.getAllNotes();
            case 'searchContainer':
                return this.getSearchResults();
            default:
                return [];
        }
    }

    private async getRootItems(): Promise<TreeItem[]> {
        const stats = this.searchService.getSearchStats();
        
        const items: TreeItem[] = [
            new TreeItem(
                'Search Notes',
                vscode.TreeItemCollapsibleState.Collapsed,
                'searchContainer',
                'search.svg'
            ),
            new TreeItem(
                `📌 Pinned Notes (${stats.pinnedNotes})`,
                vscode.TreeItemCollapsibleState.Collapsed,
                'pinnedNotesContainer',
                'pinned-note.svg'
            ),
            new TreeItem(
                '🏷️ Recent Tags',
                vscode.TreeItemCollapsibleState.Collapsed,
                'recentTagsContainer',
                'tag.svg'
            ),
            new TreeItem(
                `📝 All Notes (${stats.totalNotes})`,
                vscode.TreeItemCollapsibleState.Expanded,
                'allNotesContainer',
                'all-notes.svg'
            )
        ];

        return items;
    }

    private async getPinnedNotes(): Promise<TreeItem[]> {
        const pinnedNotes = this.searchService.getPinnedNotes();
        
        if (pinnedNotes.length === 0) {
            return [new TreeItem(
                'No pinned notes',
                vscode.TreeItemCollapsibleState.None,
                'empty',
                undefined,
                '$(info) Right-click a note to pin it'
            )];
        }

        return pinnedNotes.map(result => this.createNoteItem(result.note));
    }

    private async getRecentTags(): Promise<TreeItem[]> {
        const tags = this.searchService.getSearchStats();
        const allTags = this.storageService.getIndex().getAllTags();
        
        if (allTags.length === 0) {
            return [new TreeItem(
                'No tags found',
                vscode.TreeItemCollapsibleState.None,
                'empty',
                undefined,
                'Create notes with tags to see them here'
            )];
        }

        // Show top 10 most used tags
        return allTags
            .slice(0, 10)
            .map(tagInfo => {
                const item = new TreeItem(
                    `${tagInfo.tag} (${tagInfo.count})`,
                    vscode.TreeItemCollapsibleState.None,
                    'tag',
                    'tag.svg',
                    `${tagInfo.count} notes with this tag`
                );
                
                item.command = {
                    command: 'notes.searchByTag',
                    title: 'Search by Tag',
                    arguments: [tagInfo.tag]
                };
                
                return item;
            });
    }

    private async getAllNotes(): Promise<TreeItem[]> {
        const recentNotes = this.searchService.getRecentNotes(20);
        
        if (recentNotes.length === 0) {
            return [new TreeItem(
                'No notes found',
                vscode.TreeItemCollapsibleState.None,
                'empty',
                undefined,
                'Click the + button to create your first note'
            )];
        }

        return recentNotes.map(result => this.createNoteItem(result.note));
    }

    private async getSearchResults(): Promise<TreeItem[]> {
        // This would be populated when user performs a search
        // For now, return empty or show search instructions
        return [new TreeItem(
            'Use Ctrl+Alt+F to search',
            vscode.TreeItemCollapsibleState.None,
            'searchHint',
            'search.svg',
            'Search through all your notes'
        )];
    }

    private createNoteItem(note: NoteIndexEntry): TreeItem {
        const icon = this.getIconForNoteType(note.type, note.isPinned);
        const timeAgo = this.getTimeAgo(note.updated);
        
        const title = note.title || 'Untitled Note';
        const description = note.tags.length > 0 ? note.tags.join(', ') : '';
        const tooltip = this.createNoteTooltip(note);
        
        const item = new TreeItem(
            title,
            vscode.TreeItemCollapsibleState.None,
            'note',
            icon,
            description
        );
        
        item.tooltip = tooltip;
        
        // Set command to open note when clicked
        item.command = {
            command: 'notes.openNote',
            title: 'Open Note',
            arguments: [note.id]
        };

        return item;
    }

    private getIconForNoteType(type: 'text' | 'image' | 'hybrid', isPinned?: boolean): string {
        if (isPinned) {
            return 'pinned-note.svg';
        }
        
        switch (type) {
            case 'image':
                return 'note-image.svg';
            case 'hybrid':
                return 'note-hybrid.svg';
            case 'text':
            default:
                return 'note-text.svg';
        }
    }

    private createNoteTooltip(note: NoteIndexEntry): string {
        const lines = [
            `**${note.title}**`,
            '',
            `Created: ${new Date(note.created).toLocaleString()}`,
            `Updated: ${new Date(note.updated).toLocaleString()}`,
            `Type: ${note.type}`,
        ];

        if (note.tags.length > 0) {
            lines.push(`Tags: ${note.tags.join(', ')}`);
        }

        if (note.content) {
            lines.push('');
            lines.push('**Preview:**');
            const preview = note.content.length > 100 
                ? note.content.substring(0, 100) + '...' 
                : note.content;
            lines.push(preview);
        }

        return lines.join('\n');
    }

    private getTimeAgo(timestamp: number): string {
        const now = Date.now();
        const diff = now - timestamp;
        
        const minutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        
        if (minutes < 1) {
            return 'just now';
        } else if (minutes < 60) {
            return `${minutes}m ago`;
        } else if (hours < 24) {
            return `${hours}h ago`;
        } else if (days < 7) {
            return `${days}d ago`;
        } else {
            const weeks = Math.floor(days / 7);
            return `${weeks}w ago`;
        }
    }
}

class TreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string,
        iconName?: string,
        description?: string,
        tooltip?: string
    ) {
        super(label, collapsibleState);
        
        if (description) {
            this.description = description;
        }
        
        if (tooltip) {
            this.tooltip = tooltip;
        }
        
        if (iconName) {
            this.iconPath = {
                light: vscode.Uri.file(path.join(__filename, '..', '..', '..', 'media', 'icons', iconName)),
                dark: vscode.Uri.file(path.join(__filename, '..', '..', '..', 'media', 'icons', iconName))
            };
        }
    }
}