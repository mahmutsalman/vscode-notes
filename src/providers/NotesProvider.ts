import * as vscode from 'vscode';
import * as path from 'path';
import { StorageService } from '../services/StorageService';
import { SearchService } from '../services/SearchService';
import { NoteIndexEntry, NoteSortOrder } from '../models/NoteIndex';

export class NotesProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
    private readonly sortStateKey = 'notes.allNotesSortOrder';
    private allNotesSortOrder: NoteSortOrder;
    private activeTagFilter: string | undefined;

    constructor(
        private storageService: StorageService,
        private searchService: SearchService,
        private context: vscode.ExtensionContext
    ) {
        this.allNotesSortOrder = context.globalState.get<NoteSortOrder>(this.sortStateKey) ?? 'updated';
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    setAllNotesSortOrder(order: NoteSortOrder): void {
        if (this.allNotesSortOrder === order) {
            return;
        }

        this.allNotesSortOrder = order;
        void this.context.globalState.update(this.sortStateKey, order);
        this.refresh();
    }

    getAllNotesSortOrder(): NoteSortOrder {
        return this.allNotesSortOrder;
    }

    setTagFilter(tag?: string): void {
        const normalized = tag?.trim() ?? '';
        const nextFilter = normalized.length > 0 ? normalized : undefined;

        if (this.activeTagFilter === nextFilter) {
            return;
        }

        this.activeTagFilter = nextFilter;
        this.refresh();
    }

    clearTagFilter(): void {
        if (this.activeTagFilter === undefined) {
            return;
        }

        this.activeTagFilter = undefined;
        this.refresh();
    }

    getActiveTagFilter(): string | undefined {
        return this.activeTagFilter;
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
        const filterTag = this.activeTagFilter;
        const totalNotesCount = filterTag
            ? this.storageService.getIndex().getNotesByTag(filterTag).length
            : stats.totalNotes;
        const pinnedNotes = this.searchService.getPinnedNotes();
        const filteredPinnedCount = filterTag
            ? pinnedNotes.filter(result => result.note.tags.includes(filterTag)).length
            : stats.pinnedNotes;

        const items: TreeItem[] = [
            new TreeItem(
                'Search Notes',
                vscode.TreeItemCollapsibleState.Collapsed,
                'searchContainer',
                'search.svg'
            ),
            new TreeItem(
                filterTag ? `📌 Pinned Notes (${filteredPinnedCount})` : `📌 Pinned Notes (${stats.pinnedNotes})`,
                vscode.TreeItemCollapsibleState.Collapsed,
                'pinnedNotesContainer',
                'pinned-note.svg',
                undefined,
                filterTag ? `Pinned notes tagged with "${filterTag}"` : undefined
            ),
            new TreeItem(
                '🏷️ Recent Tags',
                vscode.TreeItemCollapsibleState.Collapsed,
                'recentTagsContainer',
                'tag.svg'
            ),
            new TreeItem(
                filterTag ? `📝 Notes tagged "${filterTag}" (${totalNotesCount})` : `📝 All Notes (${stats.totalNotes})`,
                vscode.TreeItemCollapsibleState.Expanded,
                'allNotesContainer',
                'all-notes.svg',
                undefined,
                filterTag ? `Showing notes tagged with "${filterTag}"` : undefined
            )
        ];

        return items;
    }

    private async getPinnedNotes(): Promise<TreeItem[]> {
        const filterTag = this.activeTagFilter;
        const pinnedNotes = this.searchService.getPinnedNotes();
        const results = filterTag
            ? pinnedNotes.filter(result => result.note.tags.includes(filterTag))
            : pinnedNotes;
        
        if (results.length === 0) {
            const message = filterTag
                ? `No pinned notes with "${filterTag}"`
                : 'No pinned notes';
            const tooltip = filterTag
                ? '$(info) Pin a note with this tag to see it here'
                : '$(info) Right-click a note to pin it';
            return [new TreeItem(
                message,
                vscode.TreeItemCollapsibleState.None,
                'empty',
                undefined,
                tooltip
            )];
        }

        return results.map(result => this.createNoteItem(result.note));
    }

    private async getRecentTags(): Promise<TreeItem[]> {
        const allTags = this.storageService.getIndex().getAllTags();
        const activeTag = this.activeTagFilter;
        
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
                const noteCountLabel = tagInfo.count === 1 ? '1 note' : `${tagInfo.count} notes`;
                const description = tagInfo.tag === activeTag
                    ? `Active filter • ${noteCountLabel}`
                    : `${noteCountLabel} with this tag`;
                const tooltip = tagInfo.tag === activeTag
                    ? `Filtering notes by "${tagInfo.tag}"`
                    : `${noteCountLabel} with this tag`;
                const item = new TreeItem(
                    `${tagInfo.tag} (${tagInfo.count})`,
                    vscode.TreeItemCollapsibleState.None,
                    'tag',
                    'tag.svg',
                    description,
                    tooltip
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
        const filterTag = this.activeTagFilter;

        if (filterTag) {
            const noteResults = this.searchService.searchByTag(filterTag);
            const clearFilterItem = this.createClearFilterItem();

            if (noteResults.length === 0) {
                return [
                    clearFilterItem,
                    new TreeItem(
                        `No notes found with "${filterTag}"`,
                        vscode.TreeItemCollapsibleState.None,
                        'empty',
                        undefined,
                        'Select another tag or clear the filter to see all notes'
                    )
                ];
            }

            const limitedResults = noteResults.slice(0, 50);
            return [
                clearFilterItem,
                ...limitedResults.map(result => this.createNoteItem(result.note))
            ];
        }

        const noteResults = this.searchService.getNotesSortedBy(this.allNotesSortOrder, 50);

        if (noteResults.length === 0) {
            return [new TreeItem(
                'No notes found',
                vscode.TreeItemCollapsibleState.None,
                'empty',
                undefined,
                'Click the + button to create your first note'
            )];
        }

        return noteResults.map(result => this.createNoteItem(result.note));
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
        const title = note.title || 'Untitled Note';
        const description = this.buildNoteDescription(note);
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

    private createClearFilterItem(): TreeItem {
        const item = new TreeItem(
            'Show all notes',
            vscode.TreeItemCollapsibleState.None,
            'clearTagFilter',
            undefined,
            'Clear tag filter',
            'Clear the active tag filter and show all notes'
        );

        item.iconPath = new vscode.ThemeIcon('clear-all');
        item.command = {
            command: 'notes.clearTagFilter',
            title: 'Show All Notes'
        };

        return item;
    }

    private buildNoteDescription(note: NoteIndexEntry): string {
        const parts: string[] = [this.formatCreationSummary(note.created)];

        if (note.tags.length > 0) {
            parts.push(note.tags.join(', '));
        }

        return parts.join(' • ');
    }

    private formatCreationSummary(timestamp: number): string {
        const created = new Date(timestamp);
        const now = new Date();
        const sameDay = created.toDateString() === now.toDateString();
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const timeString = created.toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit'
        });

        if (sameDay) {
            return `Created Today ${timeString}`;
        }

        if (created.toDateString() === yesterday.toDateString()) {
            return `Created Yesterday ${timeString}`;
        }

        const diffDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays < 7) {
            const weekday = created.toLocaleDateString(undefined, { weekday: 'short' });
            return `Created ${weekday} ${timeString}`;
        }

        return `Created ${this.formatCalendarDate(created)}`;
    }

    private formatCalendarDate(date: Date): string {
        const now = new Date();
        const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

        if (date.getFullYear() !== now.getFullYear()) {
            options.year = 'numeric';
        }

        return date.toLocaleDateString(undefined, options);
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
