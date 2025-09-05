import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { NoteImage } from '../models/Note';

// Fallback canvas implementation for environments without sharp
let sharp: any = null;
try {
  sharp = require('sharp');
} catch (error) {
  console.warn('Sharp not available, using fallback image processing');
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ProcessedImage {
  buffer: Buffer;
  dimensions: ImageDimensions;
  size: number;
  format: string;
}

export class ImageService {
  private readonly maxImageSize: number;
  private readonly thumbnailSize: number;
  private readonly supportedFormats = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

  constructor(maxImageSize: number = 5 * 1024 * 1024, thumbnailSize: number = 200) {
    this.maxImageSize = maxImageSize;
    this.thumbnailSize = thumbnailSize;
  }

  public async processClipboardImage(): Promise<Buffer | null> {
    try {
      // Try to get image from clipboard using VS Code API
      const clipboardImage = await vscode.env.clipboard.readText();
      
      // Check if it's a data URL (base64 image)
      if (clipboardImage.startsWith('data:image/')) {
        return this.dataUrlToBuffer(clipboardImage);
      }

      return null;
    } catch (error) {
      console.error('Failed to process clipboard image:', error);
      return null;
    }
  }

  public async processImageFile(filePath: string): Promise<ProcessedImage> {
    try {
      const buffer = await fs.readFile(filePath);
      return await this.processImageBuffer(buffer);
    } catch (error) {
      console.error(`Failed to process image file ${filePath}:`, error);
      throw error;
    }
  }

  public async processImageBuffer(buffer: Buffer): Promise<ProcessedImage> {
    if (buffer.length > this.maxImageSize) {
      throw new Error(`Image size (${buffer.length} bytes) exceeds maximum allowed size (${this.maxImageSize} bytes)`);
    }

    try {
      if (sharp) {
        return await this.processWithSharp(buffer);
      } else {
        return await this.processWithFallback(buffer);
      }
    } catch (error) {
      console.error('Failed to process image buffer:', error);
      throw error;
    }
  }

  public async createThumbnail(imageBuffer: Buffer, maxSize: number = this.thumbnailSize): Promise<Buffer> {
    try {
      if (sharp) {
        return await sharp(imageBuffer)
          .resize(maxSize, maxSize, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .jpeg({ quality: 80 })
          .toBuffer();
      } else {
        // Fallback: just return original if we can't resize
        return imageBuffer;
      }
    } catch (error) {
      console.error('Failed to create thumbnail:', error);
      throw error;
    }
  }

  public async createNoteImage(
    imageBuffer: Buffer,
    noteId: string,
    caption?: string
  ): Promise<NoteImage> {
    const processed = await this.processImageBuffer(imageBuffer);
    const timestamp = Date.now();
    const imageId = this.generateImageId();
    
    const filename = `image-${timestamp}.${this.getFormatExtension(processed.format)}`;
    const thumbnailName = `thumb-${timestamp}.jpg`;
    
    const imagePath = path.join('.notes', 'images', noteId, filename);
    const thumbnailPath = path.join('.notes', 'images', noteId, thumbnailName);
    
    const noteImage: NoteImage = {
      id: imageId,
      filename: filename,
      path: imagePath,
      thumbnail: thumbnailPath,
      size: processed.size,
      dimensions: processed.dimensions,
      created: timestamp,
      caption: caption
    };

    return noteImage;
  }

  public async validateImage(buffer: Buffer): Promise<boolean> {
    try {
      if (buffer.length === 0) {
        return false;
      }

      if (buffer.length > this.maxImageSize) {
        return false;
      }

      // Check for common image file signatures
      const signatures = [
        [0x89, 0x50, 0x4E, 0x47], // PNG
        [0xFF, 0xD8, 0xFF], // JPEG
        [0x47, 0x49, 0x46], // GIF
        [0x52, 0x49, 0x46, 0x46] // WEBP (starts with RIFF)
      ];

      return signatures.some(signature => 
        signature.every((byte, index) => buffer[index] === byte)
      );
    } catch (error) {
      console.error('Failed to validate image:', error);
      return false;
    }
  }

  public getImageDimensions(buffer: Buffer): Promise<ImageDimensions> {
    if (sharp) {
      return sharp(buffer).metadata().then((metadata: any) => ({
        width: metadata.width || 0,
        height: metadata.height || 0
      }));
    } else {
      // Fallback: return default dimensions
      return Promise.resolve({ width: 800, height: 600 });
    }
  }

  public getSupportedFormats(): string[] {
    return [...this.supportedFormats];
  }

  public isFormatSupported(format: string): boolean {
    return this.supportedFormats.includes(format.toLowerCase());
  }

  private async processWithSharp(buffer: Buffer): Promise<ProcessedImage> {
    const metadata = await sharp(buffer).metadata();
    
    return {
      buffer: buffer,
      dimensions: {
        width: metadata.width || 0,
        height: metadata.height || 0
      },
      size: buffer.length,
      format: metadata.format || 'unknown'
    };
  }

  private async processWithFallback(buffer: Buffer): Promise<ProcessedImage> {
    // Basic fallback processing
    const format = this.detectFormatFromBuffer(buffer);
    const dimensions = await this.getImageDimensions(buffer);
    
    return {
      buffer: buffer,
      dimensions: dimensions,
      size: buffer.length,
      format: format
    };
  }

  private detectFormatFromBuffer(buffer: Buffer): string {
    if (buffer.length < 4) {
      return 'unknown';
    }

    // PNG signature
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return 'png';
    }

    // JPEG signature
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return 'jpeg';
    }

    // GIF signature
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      return 'gif';
    }

    // WEBP signature
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
      // Check for WEBP
      if (buffer.length > 8 && 
          buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
        return 'webp';
      }
    }

    return 'unknown';
  }

  private dataUrlToBuffer(dataUrl: string): Buffer {
    const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error('Invalid data URL format');
    }

    return Buffer.from(matches[2], 'base64');
  }

  private generateImageId(): string {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `${timestamp}-${random}`;
  }

  private getFormatExtension(format: string): string {
    switch (format.toLowerCase()) {
      case 'jpeg':
        return 'jpg';
      case 'png':
        return 'png';
      case 'gif':
        return 'gif';
      case 'webp':
        return 'webp';
      default:
        return 'png';
    }
  }
}