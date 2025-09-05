import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Note, NoteModel } from '../models/Note';
import { NoteIndex, IndexData } from '../models/NoteIndex';

export interface StorageConfig {
  version: string;
  created: number;
  updated: number;
  settings: {
    autoSave: boolean;
    thumbnailSize: number;
    maxImageSize: number;
  };
}

export class StorageService {
  private workspaceRoot: string;
  private notesDir: string;
  private imagesDir: string;
  private configPath: string;
  private indexPath: string;
  
  private index: NoteIndex;
  private config: StorageConfig;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.notesDir = path.join(workspaceRoot, '.notes', 'notes');
    this.imagesDir = path.join(workspaceRoot, '.notes', 'images');
    this.configPath = path.join(workspaceRoot, '.notes', 'config.json');
    this.indexPath = path.join(workspaceRoot, '.notes', 'index.json');
    
    this.index = new NoteIndex();
    this.config = this.getDefaultConfig();
  }

  public async initialize(): Promise<void> {
    try {
      // Ensure directories exist
      await this.ensureDirectories();
      
      // Load configuration and index
      await this.loadConfig();
      await this.loadIndex();
      
      // Validate and repair if needed
      await this.validateStorage();
    } catch (error) {
      console.error('Failed to initialize storage:', error);
      throw error;
    }
  }

  public async saveNote(note: Note): Promise<void> {
    try {
      const noteModel = note instanceof NoteModel ? note : new NoteModel(note);
      const filename = this.getNoteFilename(noteModel.id);
      const filePath = path.join(this.notesDir, filename);
      
      // Ensure images directory exists for this note
      if (noteModel.images.length > 0) {
        const noteImagesDir = path.join(this.imagesDir, noteModel.id);
        await fs.mkdir(noteImagesDir, { recursive: true });
      }
      
      // Save note file
      await fs.writeFile(filePath, JSON.stringify(noteModel.toJSON(), null, 2), 'utf-8');
      
      // Update index
      this.index.updateNote(noteModel, filePath);
      await this.saveIndex();
      
    } catch (error) {
      console.error(`Failed to save note ${note.id}:`, error);
      throw error;
    }
  }

  public async loadNote(noteId: string): Promise<NoteModel | null> {
    try {
      const filename = this.getNoteFilename(noteId);
      const filePath = path.join(this.notesDir, filename);
      
      const content = await fs.readFile(filePath, 'utf-8');
      const noteData = JSON.parse(content);
      
      return NoteModel.fromJSON(noteData);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return null; // File not found
      }
      console.error(`Failed to load note ${noteId}:`, error);
      throw error;
    }
  }

  public async deleteNote(noteId: string): Promise<boolean> {
    try {
      const filename = this.getNoteFilename(noteId);
      const filePath = path.join(this.notesDir, filename);
      
      // Load note to get image references
      const note = await this.loadNote(noteId);
      
      // Delete note file
      await fs.unlink(filePath);
      
      // Delete associated images
      if (note && note.images.length > 0) {
        const noteImagesDir = path.join(this.imagesDir, noteId);
        try {
          await fs.rmdir(noteImagesDir, { recursive: true });
        } catch (error) {
          console.warn(`Failed to delete images directory for note ${noteId}:`, error);
        }
      }
      
      // Update index
      this.index.removeNote(noteId);
      await this.saveIndex();
      
      return true;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return false; // File not found
      }
      console.error(`Failed to delete note ${noteId}:`, error);
      throw error;
    }
  }

  public async getAllNotes(): Promise<NoteModel[]> {
    const entries = this.index.getAllNotes();
    const notes: NoteModel[] = [];
    
    for (const entry of entries) {
      try {
        const note = await this.loadNote(entry.id);
        if (note) {
          notes.push(note);
        }
      } catch (error) {
        console.error(`Failed to load note ${entry.id}:`, error);
        // Remove invalid entry from index
        this.index.removeNote(entry.id);
      }
    }
    
    return notes;
  }

  public async searchNotes(query: string): Promise<NoteModel[]> {
    const entries = this.index.searchNotes(query);
    const notes: NoteModel[] = [];
    
    for (const entry of entries) {
      try {
        const note = await this.loadNote(entry.id);
        if (note) {
          notes.push(note);
        }
      } catch (error) {
        console.error(`Failed to load note ${entry.id} during search:`, error);
      }
    }
    
    return notes;
  }

  public async saveImage(noteId: string, imageBuffer: Buffer, filename: string): Promise<string> {
    try {
      const noteImagesDir = path.join(this.imagesDir, noteId);
      await fs.mkdir(noteImagesDir, { recursive: true });
      
      const imagePath = path.join(noteImagesDir, filename);
      await fs.writeFile(imagePath, imageBuffer);
      
      return imagePath;
    } catch (error) {
      console.error(`Failed to save image for note ${noteId}:`, error);
      throw error;
    }
  }

  public async deleteImage(noteId: string, filename: string): Promise<boolean> {
    try {
      const imagePath = path.join(this.imagesDir, noteId, filename);
      await fs.unlink(imagePath);
      return true;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return false; // File not found
      }
      console.error(`Failed to delete image ${filename} for note ${noteId}:`, error);
      throw error;
    }
  }

  public getImagePath(noteId: string, filename: string): string {
    return path.join(this.imagesDir, noteId, filename);
  }

  public getIndex(): NoteIndex {
    return this.index;
  }

  public getConfig(): StorageConfig {
    return { ...this.config };
  }

  public async updateConfig(updates: Partial<StorageConfig>): Promise<void> {
    this.config = { ...this.config, ...updates };
    this.config.updated = Date.now();
    
    try {
      await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save config:', error);
      throw error;
    }
  }

  private async ensureDirectories(): Promise<void> {
    const directories = [
      path.join(this.workspaceRoot, '.notes'),
      this.notesDir,
      this.imagesDir
    ];

    for (const dir of directories) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  private async loadConfig(): Promise<void> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      this.config = { ...this.getDefaultConfig(), ...JSON.parse(content) };
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        // Config file doesn't exist, create default
        await this.updateConfig({});
      } else {
        console.error('Failed to load config:', error);
        throw error;
      }
    }
  }

  private async loadIndex(): Promise<void> {
    try {
      const content = await fs.readFile(this.indexPath, 'utf-8');
      const indexData = JSON.parse(content);
      this.index = NoteIndex.fromJSON(indexData);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        // Index file doesn't exist, will be created when first note is saved
        this.index = new NoteIndex();
      } else {
        console.error('Failed to load index:', error);
        throw error;
      }
    }
  }

  private async saveIndex(): Promise<void> {
    try {
      await fs.writeFile(this.indexPath, JSON.stringify(this.index.toJSON(), null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save index:', error);
      throw error;
    }
  }

  private async validateStorage(): Promise<void> {
    // Validate that all indexed notes exist
    const entries = this.index.getAllNotes();
    const validEntries: string[] = [];
    let hasInvalidEntries = false;

    for (const entry of entries) {
      try {
        const filename = this.getNoteFilename(entry.id);
        const filePath = path.join(this.notesDir, filename);
        await fs.access(filePath);
        validEntries.push(entry.id);
      } catch {
        console.warn(`Note file not found for indexed note: ${entry.id}`);
        hasInvalidEntries = true;
      }
    }

    // Remove invalid entries from index
    if (hasInvalidEntries) {
      const allEntries = this.index.getAllNotes();
      for (const entry of allEntries) {
        if (!validEntries.includes(entry.id)) {
          this.index.removeNote(entry.id);
        }
      }
      await this.saveIndex();
    }

    // Scan for orphaned note files and add to index
    try {
      const files = await fs.readdir(this.notesDir);
      const noteFiles = files.filter(f => f.startsWith('note-') && f.endsWith('.json'));
      
      for (const file of noteFiles) {
        const noteId = this.extractNoteIdFromFilename(file);
        if (noteId && !this.index.findById(noteId)) {
          try {
            const note = await this.loadNote(noteId);
            if (note) {
              const filePath = path.join(this.notesDir, file);
              this.index.addNote(note, filePath);
              console.info(`Added orphaned note to index: ${noteId}`);
            }
          } catch (error) {
            console.warn(`Failed to load orphaned note ${noteId}:`, error);
          }
        }
      }
      
      await this.saveIndex();
    } catch (error) {
      console.error('Failed to validate storage:', error);
    }
  }

  private getNoteFilename(noteId: string): string {
    return `${noteId}.json`;
  }

  private extractNoteIdFromFilename(filename: string): string | null {
    const match = filename.match(/^(note-\d+-[a-z0-9]+)\.json$/);
    return match ? match[1] : null;
  }

  private getDefaultConfig(): StorageConfig {
    return {
      version: '1.0.0',
      created: Date.now(),
      updated: Date.now(),
      settings: {
        autoSave: true,
        thumbnailSize: 200,
        maxImageSize: 5 * 1024 * 1024 // 5MB
      }
    };
  }
}