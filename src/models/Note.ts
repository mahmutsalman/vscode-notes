export interface NoteImage {
  id: string;
  filename: string;
  path: string;
  thumbnail: string;
  size: number;
  dimensions: {
    width: number;
    height: number;
  };
  created: number;
  caption?: string;
  color?: 'green' | 'blue' | 'purple';
}

export interface LinkedFile {
  path: string;
  line?: number;
  description?: string;
}

export type NoteColor = 'red' | 'blue' | 'green' | 'purple' | 'orange' | 'yellow' | 'pink' | 'cyan';

export interface Note {
  $schema?: string;
  id: string;
  title: string;
  content: string;
  tags: string[];
  created: number;
  updated: number;
  images: NoteImage[];
  linkedFiles: LinkedFile[];
  isPinned?: boolean;
  color?: NoteColor;
}

export class NoteModel implements Note {
  $schema?: string;
  id: string;
  title: string;
  content: string;
  tags: string[];
  created: number;
  updated: number;
  images: NoteImage[];
  linkedFiles: LinkedFile[];
  isPinned?: boolean;
  color?: NoteColor;

  constructor(data: Partial<Note> = {}) {
    this.id = data.id || this.generateId();
    this.title = data.title || 'Untitled Note';
    this.content = data.content || '';
    this.tags = data.tags || [];
    this.created = data.created || Date.now();
    this.updated = data.updated || this.created;
    this.images = data.images || [];
    this.linkedFiles = data.linkedFiles || [];
    this.isPinned = data.isPinned || false;
    this.color = data.color;
    this.$schema = data.$schema || 'https://schemas.notes.com/note-schema';
  }

  private generateId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `note-${timestamp}-${random}`;
  }

  public update(updates: Partial<Note>): void {
    Object.assign(this, updates);
    this.updated = Date.now();
  }

  public addImage(image: NoteImage): void {
    this.images.push(image);
    this.updated = Date.now();
  }

  public removeImage(imageId: string): boolean {
    const index = this.images.findIndex(img => img.id === imageId);
    if (index > -1) {
      this.images.splice(index, 1);
      this.updated = Date.now();
      return true;
    }
    return false;
  }

  public updateImageColor(imageId: string, color?: 'green' | 'blue' | 'purple'): boolean {
    const image = this.images.find(img => img.id === imageId);
    if (image) {
      if (color) {
        image.color = color;
      } else {
        delete image.color;
      }
      this.updated = Date.now();
      return true;
    }
    return false;
  }

  public updateImageCaption(imageId: string, caption?: string): boolean {
    const image = this.images.find(img => img.id === imageId);
    if (image) {
      const trimmed = caption?.trim();
      if (trimmed) {
        image.caption = trimmed.substring(0, 500);
      } else {
        delete image.caption;
      }
      this.updated = Date.now();
      return true;
    }
    return false;
  }

  public getLastImage(): NoteImage | undefined {
    return this.images.length > 0 ? this.images[this.images.length - 1] : undefined;
  }

  public addTag(tag: string): void {
    if (!this.tags.includes(tag)) {
      this.tags.push(tag);
      this.updated = Date.now();
    }
  }

  public removeTag(tag: string): boolean {
    const index = this.tags.indexOf(tag);
    if (index > -1) {
      this.tags.splice(index, 1);
      this.updated = Date.now();
      return true;
    }
    return false;
  }

  public linkToFile(file: LinkedFile): void {
    // Remove existing link to the same file/line
    this.linkedFiles = this.linkedFiles.filter(
      lf => !(lf.path === file.path && lf.line === file.line)
    );
    this.linkedFiles.push(file);
    this.updated = Date.now();
  }

  public unlinkFile(path: string, line?: number): boolean {
    const initialLength = this.linkedFiles.length;
    this.linkedFiles = this.linkedFiles.filter(
      lf => !(lf.path === path && (line === undefined || lf.line === line))
    );
    
    if (this.linkedFiles.length < initialLength) {
      this.updated = Date.now();
      return true;
    }
    return false;
  }

  public setColor(color?: NoteColor): void {
    this.color = color;
    this.updated = Date.now();
  }

  public toJSON(): Note {
    return {
      $schema: this.$schema,
      id: this.id,
      title: this.title,
      content: this.content,
      tags: this.tags,
      created: this.created,
      updated: this.updated,
      images: this.images,
      linkedFiles: this.linkedFiles,
      isPinned: this.isPinned,
      color: this.color
    };
  }

  public static fromJSON(json: any): NoteModel {
    return new NoteModel(json);
  }

  public hasImages(): boolean {
    return this.images.length > 0;
  }

  public hasContent(): boolean {
    return this.content.trim().length > 0;
  }

  public isHybrid(): boolean {
    return this.hasImages() && this.hasContent();
  }

  public getType(): 'text' | 'image' | 'hybrid' {
    if (this.isHybrid()) {
      return 'hybrid';
    }
    if (this.hasImages()) {
      return 'image';
    }
    return 'text';
  }
}