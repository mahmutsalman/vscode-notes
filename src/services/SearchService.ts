import Fuse from 'fuse.js';
import { Note } from '../models/Note';
import { NoteIndex, NoteIndexEntry, NoteSortOrder } from '../models/NoteIndex';

export interface SearchOptions {
  includeContent?: boolean;
  includeTags?: boolean;
  includeTitle?: boolean;
  fuzzy?: boolean;
  caseSensitive?: boolean;
  limit?: number;
}

export interface SearchResult {
  note: NoteIndexEntry;
  score: number;
  matches: SearchMatch[];
}

export interface SearchMatch {
  field: string;
  value: string;
  indices: number[][];
}

export class SearchService {
  private fuse!: Fuse<NoteIndexEntry>;
  private index: NoteIndex;

  constructor(index: NoteIndex) {
    this.index = index;
    this.initializeFuse();
  }

  public updateIndex(index: NoteIndex): void {
    this.index = index;
    this.initializeFuse();
  }

  public search(query: string, options: SearchOptions = {}): SearchResult[] {
    if (!query.trim()) {
      return this.getAllNotesAsResults(options.limit);
    }

    const searchOptions = {
      includeContent: options.includeContent !== false,
      includeTags: options.includeTags !== false,
      includeTitle: options.includeTitle !== false,
      fuzzy: options.fuzzy !== false,
      caseSensitive: options.caseSensitive === true,
      limit: options.limit || 50
    };

    if (searchOptions.fuzzy) {
      return this.fuzzySearch(query, searchOptions);
    } else {
      return this.exactSearch(query, searchOptions);
    }
  }

  public searchByTag(tag: string): SearchResult[] {
    const notes = this.index.getNotesByTag(tag);
    return notes.map(note => ({
      note,
      score: 1.0,
      matches: [{
        field: 'tags',
        value: tag,
        indices: []
      }]
    }));
  }

  public searchByType(type: 'text' | 'image' | 'hybrid'): SearchResult[] {
    const notes = this.index.getNotesByType(type);
    return notes.map(note => ({
      note,
      score: 1.0,
      matches: []
    }));
  }

  public getRecentNotes(limit: number = 10): SearchResult[] {
    return this.getNotesSortedBy('updated', limit);
  }

  public getNotesSortedBy(sortOrder: NoteSortOrder, limit: number = 20): SearchResult[] {
    const notes = this.index.getNotesSortedBy(sortOrder, limit);
    return notes.map(note => ({
      note,
      score: 1.0,
      matches: []
    }));
  }

  public getPinnedNotes(): SearchResult[] {
    const notes = this.index.getPinnedNotes();
    return notes.map(note => ({
      note,
      score: 1.0,
      matches: []
    }));
  }

  public getTagSuggestions(partial: string): string[] {
    return this.index.getTagSuggestions(partial);
  }

  public searchWithFilters(
    query: string,
    filters: {
      tags?: string[];
      type?: 'text' | 'image' | 'hybrid';
      dateRange?: { start?: number; end?: number };
      pinned?: boolean;
    },
    options: SearchOptions = {}
  ): SearchResult[] {
    let results = this.search(query, options);

    // Apply tag filter
    if (filters.tags && filters.tags.length > 0) {
      results = results.filter(result => 
        filters.tags!.some(tag => result.note.tags.includes(tag))
      );
    }

    // Apply type filter
    if (filters.type) {
      results = results.filter(result => result.note.type === filters.type);
    }

    // Apply date range filter
    if (filters.dateRange) {
      results = results.filter(result => {
        const noteDate = result.note.updated;
        const start = filters.dateRange!.start;
        const end = filters.dateRange!.end;
        
        if (start && noteDate < start) return false;
        if (end && noteDate > end) return false;
        
        return true;
      });
    }

    // Apply pinned filter
    if (filters.pinned !== undefined) {
      results = results.filter(result => !!result.note.isPinned === filters.pinned);
    }

    return results;
  }

  public getSearchStats() {
    const stats = this.index.getStats();
    return {
      totalNotes: stats.totalNotes,
      pinnedNotes: stats.pinnedNotes,
      typeStats: stats.typeStats,
      totalTags: stats.totalTags,
      lastUpdated: stats.updated
    };
  }

  private fuzzySearch(query: string, options: any): SearchResult[] {
    const fuseResults = this.fuse.search(query, { limit: options.limit });
    
    return fuseResults.map((result: any) => ({
      note: result.item,
      score: 1 - (result.score || 0), // Fuse.js uses 0 for perfect match, we want 1
      matches: this.extractMatches(result)
    }));
  }

  private exactSearch(query: string, options: any): SearchResult[] {
    const searchTerm = options.caseSensitive ? query : query.toLowerCase();
    const notes = this.index.getAllNotes();
    const results: SearchResult[] = [];

    for (const note of notes) {
      let score = 0;
      const matches: SearchMatch[] = [];

      // Search in title
      if (options.includeTitle) {
        const title = options.caseSensitive ? note.title : note.title.toLowerCase();
        if (title.includes(searchTerm)) {
          const startIndex = title.indexOf(searchTerm);
          score += title === searchTerm ? 20 : 10; // Exact match bonus
          matches.push({
            field: 'title',
            value: note.title,
            indices: [[startIndex, startIndex + searchTerm.length - 1]]
          });
        }
      }

      // Search in content
      if (options.includeContent) {
        const content = options.caseSensitive ? note.content : note.content.toLowerCase();
        if (content.includes(searchTerm)) {
          score += 5;
          const startIndex = content.indexOf(searchTerm);
          matches.push({
            field: 'content',
            value: note.content,
            indices: [[startIndex, startIndex + searchTerm.length - 1]]
          });
        }
      }

      // Search in tags
      if (options.includeTags) {
        for (const tag of note.tags) {
          const tagToSearch = options.caseSensitive ? tag : tag.toLowerCase();
          if (tagToSearch.includes(searchTerm)) {
            score += tagToSearch === searchTerm ? 15 : 7; // Exact match bonus
            matches.push({
              field: 'tags',
              value: tag,
              indices: [[0, tag.length - 1]]
            });
          }
        }
      }

      if (score > 0) {
        results.push({
          note,
          score: score / 100, // Normalize score
          matches
        });
      }
    }

    // Sort by score (descending) and then by updated date (descending)
    return results
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return b.note.updated - a.note.updated;
      })
      .slice(0, options.limit);
  }

  private getAllNotesAsResults(limit?: number): SearchResult[] {
    const notes = this.index.getNotesSortedBy('updated', limit || 50);
    return notes.map(note => ({
      note,
      score: 1.0,
      matches: []
    }));
  }

  private initializeFuse(): void {
    const notes = this.index.getAllNotes();
    
    this.fuse = new Fuse(notes, {
      keys: [
        { name: 'title', weight: 0.4 },
        { name: 'content', weight: 0.3 },
        { name: 'tags', weight: 0.3 }
      ],
      includeScore: true,
      includeMatches: true,
      threshold: 0.4, // Lower is more strict (0 = exact match, 1 = match anything)
      distance: 100,
      minMatchCharLength: 2,
      shouldSort: true,
      findAllMatches: true
    });
  }

  private extractMatches(fuseResult: any): SearchMatch[] {
    if (!fuseResult.matches) {
      return [];
    }

    return fuseResult.matches.map((match: any) => ({
      field: match.key,
      value: match.value,
      indices: match.indices || []
    }));
  }
}
