import { Note, NoteColor } from './Note';

export interface SearchResult {
  note: Note;
  score: number;
  matches: string[];
}

export interface NoteIndexEntry {
  id: string;
  title: string;
  content: string;
  tags: string[];
  created: number;
  updated: number;
  type: 'text' | 'image' | 'hybrid';
  filePath: string;
  isPinned?: boolean;
  color?: NoteColor;
}

export interface TagStats {
  count: number;
  firstUsed: number;
  lastUsed: number;
}

export interface IndexData {
  version: string;
  created: number;
  updated: number;
  entries: NoteIndexEntry[];
  tags: { [key: string]: TagStats };
}

export type NoteSortOrder = 'created' | 'updated';
export type TagSortOrder = 'usage' | 'created' | 'recent';

export class NoteIndex {
  private data: IndexData;
  private readonly version = '1.0.0';

  constructor(data?: IndexData) {
    this.data = data || {
      version: this.version,
      created: Date.now(),
      updated: Date.now(),
      entries: [],
      tags: {}
    };

    // Rebuild tag metadata to ensure we have recency information
    this.updateTagCounts();
  }

  public addNote(note: Note, filePath: string): void {
    // Remove existing entry if it exists
    this.removeNote(note.id);

    const content = this.stripHtml(note.content);
    const entry: NoteIndexEntry = {
      id: note.id,
      title: note.title,
      content,
      tags: note.tags,
      created: note.created,
      updated: note.updated,
      type: this.getNoteType(note),
      filePath,
      isPinned: note.isPinned,
      color: note.color
    };

    this.data.entries.push(entry);
    this.updateTagCounts();
    this.data.updated = Date.now();
  }

  public removeNote(noteId: string): boolean {
    const initialLength = this.data.entries.length;
    this.data.entries = this.data.entries.filter(entry => entry.id !== noteId);
    
    if (this.data.entries.length < initialLength) {
      this.updateTagCounts();
      this.data.updated = Date.now();
      return true;
    }
    return false;
  }

  public updateNote(note: Note, filePath: string): void {
    this.addNote(note, filePath); // This will replace existing entry
  }

  public findById(noteId: string): NoteIndexEntry | undefined {
    return this.data.entries.find(entry => entry.id === noteId);
  }

  public getAllNotes(): NoteIndexEntry[] {
    return [...this.data.entries];
  }

  public getPinnedNotes(): NoteIndexEntry[] {
    return this.data.entries.filter(entry => entry.isPinned);
  }

  public getRecentNotes(limit: number = 10): NoteIndexEntry[] {
    return this.getNotesSortedBy('updated', limit);
  }

  public getNotesSortedBy(order: NoteSortOrder, limit?: number): NoteIndexEntry[] {
    const sorted = [...this.data.entries].sort((a, b) => {
      if (order === 'created') {
        return b.created - a.created;
      }
      return b.updated - a.updated;
    });

    return typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
  }

  public getNotesByTag(tag: string): NoteIndexEntry[] {
    return this.data.entries.filter(entry => entry.tags.includes(tag));
  }

  public getNotesByType(type: 'text' | 'image' | 'hybrid'): NoteIndexEntry[] {
    return this.data.entries.filter(entry => entry.type === type);
  }

  public searchNotes(query: string): NoteIndexEntry[] {
    if (!query.trim()) {
      return this.getAllNotes();
    }

    const searchTerm = query.toLowerCase();
    const results: { entry: NoteIndexEntry; score: number }[] = [];

    for (const entry of this.data.entries) {
      let score = 0;

      // Title match (highest weight)
      if (entry.title.toLowerCase().includes(searchTerm)) {
        score += 10;
      }

      // Content match
      if (entry.content.toLowerCase().includes(searchTerm)) {
        score += 5;
      }

      // Tag match
      const tagMatch = entry.tags.some(tag => 
        tag.toLowerCase().includes(searchTerm)
      );
      if (tagMatch) {
        score += 7;
      }

      // Exact matches get bonus points
      if (entry.title.toLowerCase() === searchTerm) {
        score += 20;
      }
      if (entry.tags.some(tag => tag.toLowerCase() === searchTerm)) {
        score += 15;
      }

      if (score > 0) {
        results.push({ entry, score });
      }
    }

    // Sort by score (descending) and then by updated date (descending)
    return results
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return b.entry.updated - a.entry.updated;
      })
      .map(result => result.entry);
  }

  public getAllTags(sortOrder: TagSortOrder = 'usage'): Array<{ tag: string; count: number; firstUsed: number; lastUsed: number }> {
    const tagEntries = Object.entries(this.data.tags)
      .map(([tag, stats]) => ({ tag, ...stats }));

    const sorter = this.getTagSorter(sortOrder);
    return tagEntries.sort(sorter);
  }

  public getTagSuggestions(partial: string): string[] {
    if (!partial.trim()) {
      return this.getAllTags().map(t => t.tag);
    }

    const searchTerm = partial.toLowerCase();
    return Object.entries(this.data.tags)
      .filter(([tag]) => tag.toLowerCase().includes(searchTerm))
      .sort((a, b) => {
        const [tagA, statsA] = a;
        const [tagB, statsB] = b;

        const aLower = tagA.toLowerCase();
        const bLower = tagB.toLowerCase();

        if (aLower === searchTerm && bLower !== searchTerm) return -1;
        if (bLower === searchTerm && aLower !== searchTerm) return 1;

        const aStarts = aLower.startsWith(searchTerm);
        const bStarts = bLower.startsWith(searchTerm);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        return statsB.count - statsA.count;
      })
      .map(([tag]) => tag);
  }

  public getStats() {
    const totalNotes = this.data.entries.length;
    const pinnedNotes = this.getPinnedNotes().length;
    const typeStats = {
      text: this.getNotesByType('text').length,
      image: this.getNotesByType('image').length,
      hybrid: this.getNotesByType('hybrid').length
    };
    const totalTags = Object.keys(this.data.tags).length;

    return {
      totalNotes,
      pinnedNotes,
      typeStats,
      totalTags,
      created: this.data.created,
      updated: this.data.updated
    };
  }

  public toJSON(): IndexData {
    return {
      version: this.data.version,
      created: this.data.created,
      updated: this.data.updated,
      entries: this.data.entries,
      tags: this.data.tags
    };
  }

  public static fromJSON(json: any): NoteIndex {
    return new NoteIndex(json);
  }

  private getNoteType(note: Note): 'text' | 'image' | 'hybrid' {
    const hasImages = note.images && note.images.length > 0;
    const hasContent = this.stripHtml(note.content).length > 0;

    if (hasImages && hasContent) {
      return 'hybrid';
    }
    if (hasImages) {
      return 'image';
    }
    return 'text';
  }

  private updateTagCounts(): void {
    const tags: { [key: string]: TagStats } = {};

    for (const entry of this.data.entries) {
      for (const tag of entry.tags) {
        const existing = tags[tag];
        if (!existing) {
          tags[tag] = {
            count: 1,
            firstUsed: entry.created,
            lastUsed: entry.updated
          };
        } else {
          existing.count += 1;
          existing.firstUsed = Math.min(existing.firstUsed, entry.created);
          existing.lastUsed = Math.max(existing.lastUsed, entry.updated);
        }
      }
    }

    this.data.tags = tags;
  }

  private getTagSorter(sortOrder: TagSortOrder) {
    switch (sortOrder) {
      case 'created':
        return (a: { firstUsed: number; tag: string }, b: { firstUsed: number; tag: string }) => {
          if (a.firstUsed !== b.firstUsed) {
            return a.firstUsed - b.firstUsed;
          }
          return a.tag.localeCompare(b.tag);
        };
      case 'recent':
        return (a: { lastUsed: number; tag: string }, b: { lastUsed: number; tag: string }) => {
          if (a.lastUsed !== b.lastUsed) {
            return b.lastUsed - a.lastUsed;
          }
          return a.tag.localeCompare(b.tag);
        };
      case 'usage':
      default:
        return (a: { count: number; tag: string }, b: { count: number; tag: string }) => {
          if (a.count !== b.count) {
            return b.count - a.count;
          }
          return a.tag.localeCompare(b.tag);
        };
    }
  }

  private stripHtml(value: string): string {
    if (!value) {
      return '';
    }

    const normalized = value
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>');

    return normalized
      .replace(/\s+/g, ' ')
      .trim();
  }
}
