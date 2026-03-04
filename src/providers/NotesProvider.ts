import * as vscode from 'vscode';
import * as path from 'path';
import { StorageService } from '../services/StorageService';
import { SearchService } from '../services/SearchService';
import { NoteIndexEntry, NoteSortOrder, TagSortOrder } from '../models/NoteIndex';
import { NoteColor } from '../models/Note';

export class NotesProvider implements vscode.TreeDataProvider<TreeItem>, vscode.TreeDragAndDropController<TreeItem> {
    readonly dropMimeTypes: string[] = [];
    readonly dragMimeTypes: string[] = ['text/uri-list'];

    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
    private readonly sortStateKey = 'notes.allNotesSortOrder';
    private readonly tagSortStateKey = 'notes.tagSortOrder';
    private allNotesSortOrder: NoteSortOrder;
    private activeTagFilter: string | undefined;
    private activeColorFilter: NoteColor | undefined;
    private tagSearchText: string | undefined;
    private tagSortOrder: TagSortOrder;

    constructor(
        private storageService: StorageService,
        private searchService: SearchService,
        private context: vscode.ExtensionContext
    ) {
        this.allNotesSortOrder = context.globalState.get<NoteSortOrder>(this.sortStateKey) ?? 'updated';
        this.tagSortOrder = context.globalState.get<TagSortOrder>(this.tagSortStateKey) ?? 'usage';
        void vscode.commands.executeCommand('setContext', 'notes.tagSearchActive', false);
        void vscode.commands.executeCommand('setContext', 'notes.colorFilterActive', false);
    }

    handleDrag(source: readonly TreeItem[], dataTransfer: vscode.DataTransfer, _token: vscode.CancellationToken): void {
        const uris: vscode.Uri[] = [];
        for (const item of source) {
            if (item.noteId) {
                const entry = this.storageService.getIndex().findById(item.noteId);
                if (entry) {
                    uris.push(vscode.Uri.file(entry.filePath));
                }
            }
        }
        if (uris.length > 0) {
            dataTransfer.set('text/uri-list', new vscode.DataTransferItem(uris.map(u => u.toString()).join('\r\n')));
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    setAllNotesSortOrder(order: NoteSortOrder): void {
        console.log('[NotesProvider] setAllNotesSortOrder called', {
            currentOrder: this.allNotesSortOrder,
            newOrder: order,
            willSkip: this.allNotesSortOrder === order
        });

        if (this.allNotesSortOrder === order) {
            console.log('[NotesProvider] Skipping - same order');
            return;
        }

        this.allNotesSortOrder = order;
        void this.context.globalState.update(this.sortStateKey, order);
        console.log('[NotesProvider] Triggering refresh with new order:', order);
        this.refresh();
    }

    getAllNotesSortOrder(): NoteSortOrder {
        return this.allNotesSortOrder;
    }

    getTagSortOrder(): TagSortOrder {
        return this.tagSortOrder;
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

    setTagSortOrder(order: TagSortOrder): void {
        if (this.tagSortOrder === order) {
            return;
        }

        this.tagSortOrder = order;
        void this.context.globalState.update(this.tagSortStateKey, order);
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

    setColorFilter(color?: NoteColor): void {
        if (this.activeColorFilter === color) {
            return;
        }

        this.activeColorFilter = color;
        this.updateColorFilterContext();
        this.refresh();
    }

    clearColorFilter(): void {
        if (this.activeColorFilter === undefined) {
            return;
        }

        this.activeColorFilter = undefined;
        this.updateColorFilterContext();
        this.refresh();
    }

    getActiveColorFilter(): NoteColor | undefined {
        return this.activeColorFilter;
    }

    setTagSearchText(value?: string): void {
        const normalized = value?.trim() ?? '';
        const nextValue = normalized.length > 0 ? normalized : undefined;

        if (this.tagSearchText === nextValue) {
            return;
        }

        this.tagSearchText = nextValue;
        this.updateTagSearchContext();
        this.refresh();
    }

    clearTagSearchText(): void {
        if (this.tagSearchText === undefined) {
            return;
        }

        this.tagSearchText = undefined;
        this.updateTagSearchContext();
        this.refresh();
    }

    getTagSearchText(): string | undefined {
        return this.tagSearchText;
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
            case 'colorsContainer':
                return this.getColors();
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
        const filterColor = this.activeColorFilter;
        const index = this.storageService.getIndex();

        // Calculate total notes count with both filters
        let totalNotesCount = stats.totalNotes;
        if (filterTag || filterColor) {
            let entries = index.getAllNotes();
            if (filterTag) {
                entries = entries.filter(e => e.tags.includes(filterTag));
            }
            if (filterColor) {
                entries = this.applyColorFilter(entries, filterColor);
            }
            totalNotesCount = entries.length;
        }

        // Calculate filtered pinned count
        const pinnedNotes = this.searchService.getPinnedNotes();
        let filteredPinnedCount = stats.pinnedNotes;
        if (filterTag || filterColor) {
            let filtered = pinnedNotes;
            if (filterTag) {
                filtered = filtered.filter(result => result.note.tags.includes(filterTag));
            }
            if (filterColor) {
                filtered = filtered.filter(result => result.note.color === filterColor);
            }
            filteredPinnedCount = filtered.length;
        }

        const tagSortLabel = this.getTagSortLabel();
        const tagSectionLabel = this.tagSearchText
            ? `🏷️ Tags matching "${this.tagSearchText}" (${tagSortLabel})`
            : `🏷️ Tags (${tagSortLabel})`;
        const tagSectionTooltip = this.tagSearchText
            ? `Tags that include "${this.tagSearchText}" sorted by ${tagSortLabel}`
            : `Tags sorted by ${tagSortLabel}`;

        // Build "All Notes" label
        const allNotesLabel = this.buildAllNotesLabel(filterTag, filterColor, totalNotesCount, stats.totalNotes);
        const allNotesTooltip = this.buildAllNotesTooltip(filterTag, filterColor);
        const pinnedLabel = this.buildPinnedLabel(filterTag, filterColor, filteredPinnedCount, stats.pinnedNotes);
        const pinnedTooltip = this.buildPinnedTooltip(filterTag, filterColor);

        const items: TreeItem[] = [
            new TreeItem(
                'Search Notes',
                vscode.TreeItemCollapsibleState.Collapsed,
                'searchContainer',
                'search.svg'
            ),
            new TreeItem(
                pinnedLabel,
                vscode.TreeItemCollapsibleState.Collapsed,
                'pinnedNotesContainer',
                'pinned-note.svg',
                undefined,
                pinnedTooltip
            ),
            new TreeItem(
                tagSectionLabel,
                vscode.TreeItemCollapsibleState.Collapsed,
                'recentTagsContainer',
                'tag.svg',
                undefined,
                tagSectionTooltip
            ),
            new TreeItem(
                '🎨 Colors',
                vscode.TreeItemCollapsibleState.Collapsed,
                'colorsContainer',
                undefined,
                undefined,
                'Filter notes by color'
            ),
            new TreeItem(
                allNotesLabel,
                vscode.TreeItemCollapsibleState.Expanded,
                'allNotesContainer',
                'all-notes.svg',
                undefined,
                allNotesTooltip
            )
        ];

        return items;
    }

    private async getPinnedNotes(): Promise<TreeItem[]> {
        const filterTag = this.activeTagFilter;
        const filterColor = this.activeColorFilter;
        const pinnedNotes = this.searchService.getPinnedNotes();
        let filteredResults = pinnedNotes;

        if (filterTag) {
            filteredResults = filteredResults.filter(result => result.note.tags.includes(filterTag));
        }
        if (filterColor) {
            filteredResults = filteredResults.filter(result => result.note.color === filterColor);
        }

        if (filteredResults.length === 0) {
            const hasFilter = filterTag || filterColor;
            const message = hasFilter
                ? 'No pinned notes matching filters'
                : 'No pinned notes';
            const tooltip = hasFilter
                ? '$(info) Pin a note matching current filters to see it here'
                : '$(info) Right-click a note to pin it';
            return [new TreeItem(
                message,
                vscode.TreeItemCollapsibleState.None,
                'empty',
                undefined,
                tooltip
            )];
        }

        return filteredResults.map(result => this.createNoteItem(result.note));
    }

    private async getRecentTags(): Promise<TreeItem[]> {
        const allTags = this.storageService.getIndex().getAllTags(this.tagSortOrder);
        const activeTag = this.activeTagFilter;
        const searchText = this.tagSearchText?.toLowerCase();
        const filteredTags = searchText
            ? allTags.filter(tagInfo => tagInfo.tag.toLowerCase().includes(searchText))
            : allTags;
        const clearSearchItem = this.tagSearchText ? this.createClearTagSearchItem() : undefined;
        
        if (filteredTags.length === 0) {
            const emptyLabel = this.tagSearchText
                ? 'No tags match your search'
                : 'No tags found';
            const emptyTooltip = this.tagSearchText
                ? 'Try a different search or clear the filter'
                : 'Create notes with tags to see them here';

            const items: TreeItem[] = [];
            if (clearSearchItem) {
                items.push(clearSearchItem);
            }
            items.push(new TreeItem(
                emptyLabel,
                vscode.TreeItemCollapsibleState.None,
                'empty',
                undefined,
                emptyTooltip
            ));
            return items;
        }
        
        // Show top 10 most used tags
        const items = filteredTags
            .slice(0, 10)
            .map(tagInfo => {
                const noteCountLabel = tagInfo.count === 1 ? '1 note' : `${tagInfo.count} notes`;
                const description = tagInfo.tag === activeTag
                    ? `Active filter • ${noteCountLabel}`
                    : `${noteCountLabel} with this tag`;
                const tooltipLines = [
                    tagInfo.tag === activeTag
                        ? `Filtering notes by "${tagInfo.tag}"`
                        : description,
                    `First used: ${this.formatTimestamp(tagInfo.firstUsed)}`,
                    `Last used: ${this.formatTimestamp(tagInfo.lastUsed)}`
                ];
                const item = new TreeItem(
                    `${tagInfo.tag} (${tagInfo.count})`,
                    vscode.TreeItemCollapsibleState.None,
                    'tag',
                    'tag.svg',
                    description,
                    tooltipLines.join('\n')
                );
                
                item.command = {
                    command: 'notes.searchByTag',
                    title: 'Search by Tag',
                    arguments: [tagInfo.tag]
                };
                
                return item;
            });

        if (clearSearchItem) {
            return [clearSearchItem, ...items];
        }

        return items;
    }

    private async getColors(): Promise<TreeItem[]> {
        const index = this.storageService.getIndex();
        const allEntries = index.getAllNotes();
        const activeColor = this.activeColorFilter;

        const colorEmojis: Record<string, string> = {
            red: '🔴', blue: '🔵', green: '🟢', purple: '🟣',
            orange: '🟠', yellow: '🟡', pink: '🩷', cyan: '🩵'
        };
        const allColors: NoteColor[] = ['red', 'blue', 'green', 'purple', 'orange', 'yellow', 'pink', 'cyan'];

        // Count notes per color and notes with no color
        const colorCounts = new Map<string, number>();
        let defaultCount = 0;
        for (const entry of allEntries) {
            if (entry.color) {
                colorCounts.set(entry.color, (colorCounts.get(entry.color) || 0) + 1);
            } else {
                defaultCount++;
            }
        }

        const items: TreeItem[] = [];

        // "Default" item = show all notes (clear color filter)
        const totalCount = allEntries.length;
        const isDefaultActive = activeColor === undefined;
        const defaultDescription = isDefaultActive
            ? `Showing all • ${totalCount} notes`
            : `${totalCount} notes total`;
        const defaultItem = new TreeItem(
            `Default (${totalCount})`,
            vscode.TreeItemCollapsibleState.None,
            'color',
            undefined,
            defaultDescription,
            isDefaultActive ? 'Showing all notes' : 'Click to clear color filter and show all notes'
        );
        defaultItem.iconPath = new vscode.ThemeIcon('circle-outline');
        defaultItem.command = {
            command: 'notes.clearColorFilter',
            title: 'Show All Notes'
        };
        items.push(defaultItem);

        // Each color
        for (const color of allColors) {
            const count = colorCounts.get(color) || 0;
            const capitalize = color.charAt(0).toUpperCase() + color.slice(1);
            const noteLabel = count === 1 ? '1 note' : `${count} notes`;
            const isActive = activeColor === color;
            const description = isActive
                ? `Active filter • ${noteLabel}`
                : `${noteLabel}`;
            const tooltip = isActive
                ? `Filtering notes by ${color}`
                : `Click to show only ${color} notes`;

            const item = new TreeItem(
                `${colorEmojis[color]} ${capitalize} (${count})`,
                vscode.TreeItemCollapsibleState.None,
                'color',
                undefined,
                description,
                tooltip
            );
            item.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor(`notes.color.${color}`));
            item.command = {
                command: 'notes.selectColor',
                title: 'Filter by Color',
                arguments: [color]
            };
            items.push(item);
        }

        return items;
    }

    private async getAllNotes(): Promise<TreeItem[]> {
        const filterTag = this.activeTagFilter;
        const filterColor = this.activeColorFilter;
        const hasFilter = filterTag || filterColor;

        if (hasFilter) {
            // Get entries based on tag filter or all entries
            const index = this.storageService.getIndex();
            let entries = filterTag
                ? index.getNotesByTag(filterTag)
                : index.getAllNotes();

            // Apply color filter
            if (filterColor) {
                entries = this.applyColorFilter(entries, filterColor);
            }

            const clearItems: TreeItem[] = [];
            if (filterTag) {
                clearItems.push(this.createClearFilterItem());
            }
            if (filterColor) {
                clearItems.push(this.createClearColorFilterItem());
            }

            if (entries.length === 0) {
                return [
                    ...clearItems,
                    new TreeItem(
                        'No notes matching filters',
                        vscode.TreeItemCollapsibleState.None,
                        'empty',
                        undefined,
                        'Adjust or clear filters to see notes'
                    )
                ];
            }

            const limitedEntries = entries.slice(0, 50);
            return [
                ...clearItems,
                ...limitedEntries.map(entry => this.createNoteItem(entry))
            ];
        }

        const noteResults = this.searchService.getNotesSortedBy(this.allNotesSortOrder, 50);
        console.log('[NotesProvider] getAllNotes sorting', {
            sortOrder: this.allNotesSortOrder,
            resultCount: noteResults.length,
            firstFew: noteResults.slice(0, 3).map(r => ({
                title: r.note.title,
                created: new Date(r.note.created).toLocaleString(),
                updated: new Date(r.note.updated).toLocaleString()
            }))
        });

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
        const title = note.title || 'Untitled Note';
        const description = this.buildNoteDescription(note);
        const tooltip = this.createNoteTooltip(note);

        const item = new TreeItem(
            title,
            vscode.TreeItemCollapsibleState.None,
            'note',
            undefined,
            description
        );

        // Set the icon with color support
        item.iconPath = this.getIconForNoteType(note.type, note.isPinned, note.color);
        item.tooltip = tooltip;

        // Set resourceUri for native drag-and-drop file path support
        item.resourceUri = vscode.Uri.file(note.filePath);

        // Store note ID for context menu commands
        item.noteId = note.id;

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

    private createClearColorFilterItem(): TreeItem {
        const item = new TreeItem(
            'Show all colors',
            vscode.TreeItemCollapsibleState.None,
            'clearColorFilter',
            undefined,
            'Clear color filter',
            'Clear the active color filter and show all notes'
        );

        item.iconPath = new vscode.ThemeIcon('clear-all');
        item.command = {
            command: 'notes.clearColorFilter',
            title: 'Show All Colors'
        };

        return item;
    }

    private createClearTagSearchItem(): TreeItem {
        const item = new TreeItem(
            'Clear tag search',
            vscode.TreeItemCollapsibleState.None,
            'clearTagSearch',
            undefined,
            'Reset tag search',
            'Show the full list of tags'
        );

        item.iconPath = new vscode.ThemeIcon('clear-all');
        item.command = {
            command: 'notes.clearTagSearch',
            title: 'Clear Tag Search'
        };

        return item;
    }

    private updateTagSearchContext(): void {
        void vscode.commands.executeCommand('setContext', 'notes.tagSearchActive', this.tagSearchText !== undefined);
    }

    private updateColorFilterContext(): void {
        void vscode.commands.executeCommand('setContext', 'notes.colorFilterActive', this.activeColorFilter !== undefined);
    }

    private getTagSortLabel(): string {
        switch (this.tagSortOrder) {
            case 'created':
                return 'Oldest first';
            case 'recent':
                return 'Last used';
            case 'usage':
            default:
                return 'Most used';
        }
    }

    private applyColorFilter(entries: NoteIndexEntry[], filterColor: NoteColor): NoteIndexEntry[] {
        return entries.filter(e => e.color === filterColor);
    }

    private capitalizeColor(color: NoteColor): string {
        return color.charAt(0).toUpperCase() + color.slice(1);
    }

    private buildAllNotesLabel(filterTag: string | undefined, filterColor: NoteColor | undefined, filteredCount: number, totalCount: number): string {
        if (filterTag && filterColor) {
            return `📝 ${this.capitalizeColor(filterColor)} notes tagged "${filterTag}" (${filteredCount})`;
        }
        if (filterColor) {
            return `📝 ${this.capitalizeColor(filterColor)} Notes (${filteredCount})`;
        }
        if (filterTag) {
            return `📝 Notes tagged "${filterTag}" (${filteredCount})`;
        }
        return `📝 All Notes (${totalCount})`;
    }

    private buildAllNotesTooltip(filterTag: string | undefined, filterColor: NoteColor | undefined): string | undefined {
        if (filterTag && filterColor) {
            return `Showing ${filterColor} notes tagged with "${filterTag}"`;
        }
        if (filterColor) {
            return `Showing ${filterColor} notes`;
        }
        if (filterTag) {
            return `Showing notes tagged with "${filterTag}"`;
        }
        return undefined;
    }

    private buildPinnedLabel(filterTag: string | undefined, filterColor: NoteColor | undefined, filteredCount: number, totalCount: number): string {
        if (filterTag || filterColor) {
            return `📌 Pinned Notes (${filteredCount})`;
        }
        return `📌 Pinned Notes (${totalCount})`;
    }

    private buildPinnedTooltip(filterTag: string | undefined, filterColor: NoteColor | undefined): string | undefined {
        const parts: string[] = [];
        if (filterTag) {
            parts.push(`tagged with "${filterTag}"`);
        }
        if (filterColor) {
            parts.push(`colored ${filterColor}`);
        }
        if (parts.length > 0) {
            return `Pinned notes ${parts.join(' and ')}`;
        }
        return undefined;
    }

    private formatTimestamp(timestamp: number): string {
        if (!timestamp) {
            return 'Unknown';
        }

        return new Date(timestamp).toLocaleString();
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

    private getIconForNoteType(type: 'text' | 'image' | 'hybrid', isPinned?: boolean, color?: string): vscode.ThemeIcon | { light: vscode.Uri; dark: vscode.Uri } {
        if (isPinned) {
            return new vscode.ThemeIcon('pinned', color ? new vscode.ThemeColor(`notes.color.${color}`) : undefined);
        }

        let iconName: string;
        switch (type) {
            case 'image':
                iconName = 'file-media';
                break;
            case 'hybrid':
                iconName = 'file-media';
                break;
            case 'text':
            default:
                iconName = 'note';
                break;
        }

        return new vscode.ThemeIcon(iconName, color ? new vscode.ThemeColor(`notes.color.${color}`) : undefined);
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
    public noteId?: string;

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
