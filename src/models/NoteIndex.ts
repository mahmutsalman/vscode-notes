import { Note } from './Note';

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
}

export interface IndexData {
  version: string;
  created: number;
  updated: number;
  entries: NoteIndexEntry[];
  tags: { [key: string]: number }; // tag -> count
}

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
  }

  public addNote(note: Note, filePath: string): void {
    // Remove existing entry if it exists
    this.removeNote(note.id);

    const entry: NoteIndexEntry = {
      id: note.id,
      title: note.title,
      content: note.content,
      tags: note.tags,
      created: note.created,
      updated: note.updated,
      type: this.getNoteType(note),
      filePath,
      isPinned: note.isPinned
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
    return [...this.data.entries]
      .sort((a, b) => b.updated - a.updated)
      .slice(0, limit);
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

  public getAllTags(): { tag: string; count: number }[] {
    return Object.entries(this.data.tags)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  public getTagSuggestions(partial: string): string[] {
    if (!partial.trim()) {
      return this.getAllTags().map(t => t.tag);
    }

    const searchTerm = partial.toLowerCase();
    return Object.keys(this.data.tags)
      .filter(tag => tag.toLowerCase().includes(searchTerm))
      .sort((a, b) => {
        // Exact matches first
        if (a.toLowerCase() === searchTerm) return -1;
        if (b.toLowerCase() === searchTerm) return 1;
        
        // Then starts with
        const aStarts = a.toLowerCase().startsWith(searchTerm);
        const bStarts = b.toLowerCase().startsWith(searchTerm);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        
        // Then by usage count
        return this.data.tags[b] - this.data.tags[a];
      });
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
    const hasContent = note.content && note.content.trim().length > 0;

    if (hasImages && hasContent) {
      return 'hybrid';
    }
    if (hasImages) {
      return 'image';
    }
    return 'text';
  }

  private updateTagCounts(): void {
    this.data.tags = {};
    
    for (const entry of this.data.entries) {
      for (const tag of entry.tags) {
        this.data.tags[tag] = (this.data.tags[tag] || 0) + 1;
      }
    }
  }
}