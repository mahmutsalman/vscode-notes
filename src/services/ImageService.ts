import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
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
    const execAsync = promisify(exec);
    const platform = os.platform();
    
    try {
      console.log(`🖼️ Processing clipboard image on ${platform}`);
      
      // Try platform-specific clipboard image access
      let imageBuffer: Buffer | null = null;
      
      switch (platform) {
        case 'darwin': // macOS
          imageBuffer = await this.getClipboardImageMacOS(execAsync);
          break;
          
        case 'win32': // Windows
          imageBuffer = await this.getClipboardImageWindows(execAsync);
          break;
          
        case 'linux': // Linux
          imageBuffer = await this.getClipboardImageLinux(execAsync);
          break;
          
        default:
          console.warn(`🚫 Platform ${platform} not supported for clipboard image access`);
      }
      
      if (imageBuffer) {
        console.log(`✅ Successfully extracted image from clipboard (${imageBuffer.length} bytes)`);
        return imageBuffer;
      }
      
      // Fallback: try to get image from clipboard using VS Code API (data URL)
      console.log('📱 Trying fallback method: VS Code clipboard text API for data URLs');
      const clipboardText = await vscode.env.clipboard.readText();
      
      // Check if it's a data URL (base64 image)
      if (clipboardText && clipboardText.startsWith('data:image/')) {
        console.log('📋 Found data URL in clipboard text');
        return this.dataUrlToBuffer(clipboardText);
      }
      
      console.log('❌ No image found in clipboard');
      return null;
      
    } catch (error) {
      console.error('❌ Failed to process clipboard image:', error);
      return null;
    }
  }

  private async getClipboardImageMacOS(execAsync: (command: string) => Promise<{ stdout: string; stderr: string }>): Promise<Buffer | null> {
    try {
      console.log('🍎 Using macOS clipboard access via osascript');
      
      // First check if clipboard contains image data
      const { stdout: clipboardInfo } = await execAsync('osascript -e "clipboard info"');
      console.log('📋 Clipboard info:', clipboardInfo);
      
      if (!clipboardInfo.includes('PNGf') && !clipboardInfo.includes('JPEG') && !clipboardInfo.includes('TIFF')) {
        console.log('❌ No image data found in macOS clipboard');
        return null;
      }
      
      // Create temporary file path
      const tempDir = os.tmpdir();
      const tempFileName = `clipboard-image-${Date.now()}.png`;
      const tempFilePath = path.join(tempDir, tempFileName);
      
      console.log(`💾 Saving clipboard image to temp file: ${tempFilePath}`);
      
      // Use osascript to save clipboard image as PNG
      const osascriptCommand = `osascript -e "set png_data to the clipboard as «class PNGf»" ` +
        `-e "set the_file to open for access POSIX file \\"${tempFilePath}\\" with write permission" ` +
        `-e "set eof the_file to 0" ` +
        `-e "write png_data to the_file" ` +
        `-e "close access the_file"`;
      
      await execAsync(osascriptCommand);
      console.log(`✅ Successfully saved clipboard image to temp file: ${tempFilePath}`);
      
      // Read the temporary file
      const imageBuffer = await fs.readFile(tempFilePath);
      
      // Clean up temporary file
      try {
        await fs.unlink(tempFilePath);
        console.log('🧹 Cleaned up temp file');
      } catch (cleanupError) {
        console.warn('⚠️ Failed to clean up temp file:', cleanupError);
      }
      
      return imageBuffer;
      
    } catch (error) {
      console.error('❌ macOS clipboard access failed:', error);
      throw error;
    }
  }

  private async getClipboardImageWindows(execAsync: (command: string) => Promise<{ stdout: string; stderr: string }>): Promise<Buffer | null> {
    try {
      console.log('🪟 Using Windows clipboard access via PowerShell');
      
      // Create temporary file path
      const tempDir = os.tmpdir();
      const tempFileName = `clipboard-image-${Date.now()}.png`;
      const tempFilePath = path.join(tempDir, tempFileName);
      
      console.log(`💾 Saving clipboard image to temp file: ${tempFilePath}`);
      
      // Use PowerShell to get clipboard image
      const powershellCommand = `powershell -command "` +
        `$image = Get-Clipboard -Format Image; ` +
        `if ($image -ne $null) { ` +
        `$image.Save('${tempFilePath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png); ` +
        `Write-Host 'Image saved'; ` +
        `} else { ` +
        `Write-Host 'No image in clipboard'; ` +
        `exit 1; ` +
        `}"`;
      
      const { stdout } = await execAsync(powershellCommand);
      
      if (!stdout.includes('Image saved')) {
        console.log('❌ No image data found in Windows clipboard');
        return null;
      }
      
      console.log('✅ Successfully saved clipboard image to temp file');
      
      // Read the temporary file
      const imageBuffer = await fs.readFile(tempFilePath);
      
      // Clean up temporary file
      try {
        await fs.unlink(tempFilePath);
        console.log('🧹 Cleaned up temp file');
      } catch (cleanupError) {
        console.warn('⚠️ Failed to clean up temp file:', cleanupError);
      }
      
      return imageBuffer;
      
    } catch (error) {
      console.error('❌ Windows clipboard access failed:', error);
      throw error;
    }
  }

  private async getClipboardImageLinux(execAsync: (command: string) => Promise<{ stdout: string; stderr: string }>): Promise<Buffer | null> {
    try {
      console.log('🐧 Using Linux clipboard access via xclip');
      
      // Check if xclip is available
      try {
        await execAsync('which xclip');
      } catch (error) {
        console.error('❌ xclip not found. Please install xclip: sudo apt-get install xclip');
        throw new Error('xclip is required for clipboard image access on Linux. Please install it with: sudo apt-get install xclip');
      }
      
      // Try to get image from clipboard using xclip
      const { stdout: imageData } = await execAsync('xclip -selection clipboard -t image/png -o | base64');
      
      if (!imageData.trim()) {
        console.log('❌ No PNG image data found in Linux clipboard');
        return null;
      }
      
      console.log('✅ Successfully extracted image from Linux clipboard');
      
      // Convert base64 to buffer
      const imageBuffer = Buffer.from(imageData.trim(), 'base64');
      
      return imageBuffer;
      
    } catch (error) {
      console.error('❌ Linux clipboard access failed:', error);
      throw error;
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
    console.log(`🔍 Image processing result: format=${processed.format}, size=${processed.size}`);
    
    const timestamp = Date.now();
    const imageId = this.generateImageId();
    
    const formatExtension = this.getFormatExtension(processed.format);
    console.log(`📁 Format extension: ${processed.format} → ${formatExtension}`);
    
    const filename = `image-${timestamp}.${formatExtension}`;
    const thumbnailName = `thumb-${timestamp}.jpg`;
    
    console.log(`📄 Created filenames: image=${filename}, thumb=${thumbnailName}`);
    
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