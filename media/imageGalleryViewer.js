// Image Gallery Viewer - Standalone version for webview panel
// Based on ImageModal from noteEditor.js but adapted for dedicated gallery panel

class GalleryViewer {
    constructor() {
        this.images = window.images || [];
        this.currentIndex = 0;
        this.currentImage = null;
        this.preloadedImages = new Map();
        
        // Zoom state management
        this.zoomLevel = 1.0;
        this.minZoom = 0.5;
        this.maxZoom = 5.0;
        this.zoomStep = 0.1;
        this.panX = 0;
        this.panY = 0;
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragStartPanX = 0;
        this.dragStartPanY = 0;
        
        console.log(`🖼️ Gallery viewer initialized with ${this.images.length} images`);
        
        if (this.images.length === 0) {
            console.warn('⚠️ No images available for gallery');
            this.showEmptyState();
            return;
        }
        
        this.createGallery();
        this.attachEventListeners();
        this.preloadAdjacentImages();
        this.updateDisplay();
    }
    
    showEmptyState() {
        const container = document.getElementById('galleryContent');
        container.innerHTML = `
            <div style="text-align: center; color: var(--vscode-descriptionForeground);">
                <div style="font-size: 48px; margin-bottom: 16px;">📸</div>
                <div>No images in this note</div>
            </div>
        `;
    }
    
    createGallery() {
        const container = document.getElementById('galleryContent');
        container.innerHTML = `
            <div class="gallery-viewer">
                <div class="gallery-controls">
                    <div class="gallery-nav-controls">
                        <button class="gallery-nav-btn" id="prevImage" aria-label="Previous image" title="Previous (← or A)">‹</button>
                        <span class="gallery-image-counter" id="imageCounter">${this.currentIndex + 1} / ${this.images.length}</span>
                        <button class="gallery-nav-btn" id="nextImage" aria-label="Next image" title="Next (→ or D)">›</button>
                    </div>
                    
                    <div class="gallery-zoom-controls">
                        <button class="gallery-zoom-btn" id="zoomOut" aria-label="Zoom Out" title="Zoom Out (- or Ctrl+Mouse Wheel)">−</button>
                        <span class="gallery-zoom-indicator" id="zoomIndicator">100%</span>
                        <button class="gallery-zoom-btn" id="zoomIn" aria-label="Zoom In" title="Zoom In (+ or Ctrl+Mouse Wheel)">+</button>
                        <button class="gallery-zoom-btn" id="zoomReset" aria-label="Reset Zoom" title="Reset Zoom (Double-click)">⌂</button>
                    </div>
                    
                    <div class="gallery-color-controls">
                        <button class="gallery-color-btn" data-color="green" title="Assign Green (Press 1)">●</button>
                        <button class="gallery-color-btn" data-color="blue" title="Assign Blue (Press 2)">●</button>
                        <button class="gallery-color-btn" data-color="purple" title="Assign Purple (Press 3)">●</button>
                        <button class="gallery-color-btn clear-color" data-color="" title="Clear Color (Press 0)">○</button>
                    </div>
                </div>
                
                <div class="gallery-image-container" id="imageContainer">
                    <img id="galleryImage" class="gallery-main-image" alt="Gallery image" />
                    <div class="gallery-loading" id="imageLoading">Loading...</div>
                </div>
                
                <div class="gallery-footer">
                    <div class="gallery-image-info">
                        <span id="imageFilename"></span>
                        <span id="imageDimensions"></span>
                        <span class="gallery-hint">Tip: Arrow keys to navigate, Cmd/Ctrl + Mouse Wheel to zoom</span>
                    </div>
                </div>
            </div>
        `;
        
        this.currentImage = document.getElementById('galleryImage');
        
        // Add styles for gallery
        this.addGalleryStyles();
    }
    
    addGalleryStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .gallery-viewer {
                height: 100%;
                display: flex;
                flex-direction: column;
                background-color: var(--vscode-editor-background);
            }
            
            .gallery-controls {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 12px;
                background-color: var(--vscode-sideBar-background);
                border-bottom: 1px solid var(--vscode-sideBar-border);
                gap: 12px;
                flex-wrap: wrap;
            }
            
            .gallery-nav-controls, .gallery-zoom-controls, .gallery-color-controls {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .gallery-nav-btn, .gallery-zoom-btn {
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                border-radius: 3px;
                width: 28px;
                height: 28px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                font-size: 16px;
                font-weight: bold;
            }
            
            .gallery-nav-btn:hover, .gallery-zoom-btn:hover {
                background: var(--vscode-button-hoverBackground);
            }
            
            .gallery-nav-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            .gallery-image-counter, .gallery-zoom-indicator {
                color: var(--vscode-foreground);
                font-size: 12px;
                font-weight: 500;
                min-width: 60px;
                text-align: center;
            }
            
            .gallery-color-btn {
                width: 20px;
                height: 20px;
                border-radius: 50%;
                border: 2px solid var(--vscode-contrastBorder);
                cursor: pointer;
                font-size: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .gallery-color-btn[data-color="green"] {
                background-color: #22c55e;
                color: white;
            }
            
            .gallery-color-btn[data-color="blue"] {
                background-color: #3b82f6;
                color: white;
            }
            
            .gallery-color-btn[data-color="purple"] {
                background-color: #a855f7;
                color: white;
            }
            
            .gallery-color-btn.clear-color {
                background-color: transparent;
                color: var(--vscode-foreground);
            }
            
            .gallery-color-btn.active {
                border-color: var(--vscode-focusBorder);
                box-shadow: 0 0 0 1px var(--vscode-focusBorder);
            }
            
            .gallery-image-container {
                flex: 1;
                position: relative;
                overflow: hidden;
                display: flex;
                align-items: center;
                justify-content: center;
                background-color: var(--vscode-editor-background);
            }
            
            .gallery-main-image {
                max-width: 100%;
                max-height: 100%;
                object-fit: contain;
                cursor: grab;
                transition: transform 0.1s ease;
                transform-origin: center center;
            }
            
            .gallery-main-image:active {
                cursor: grabbing;
            }
            
            .gallery-main-image.zoomed {
                cursor: move;
            }
            
            .gallery-loading {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                color: var(--vscode-descriptionForeground);
                display: none;
            }
            
            .gallery-footer {
                padding: 8px 12px;
                background-color: var(--vscode-sideBar-background);
                border-top: 1px solid var(--vscode-sideBar-border);
            }
            
            .gallery-image-info {
                display: flex;
                gap: 16px;
                align-items: center;
                font-size: 11px;
                color: var(--vscode-descriptionForeground);
                flex-wrap: wrap;
            }
            
            .gallery-hint {
                margin-left: auto;
                font-style: italic;
            }
            
            @media (max-width: 600px) {
                .gallery-controls {
                    flex-direction: column;
                    gap: 8px;
                }
                
                .gallery-hint {
                    display: none;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    attachEventListeners() {
        // Navigation buttons
        document.getElementById('prevImage').addEventListener('click', () => this.previousImage());
        document.getElementById('nextImage').addEventListener('click', () => this.nextImage());
        
        // Zoom controls
        document.getElementById('zoomOut').addEventListener('click', () => this.zoomOut());
        document.getElementById('zoomIn').addEventListener('click', () => this.zoomIn());
        document.getElementById('zoomReset').addEventListener('click', () => this.resetZoom());
        
        // Color controls
        document.querySelectorAll('.gallery-color-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const color = btn.dataset.color;
                this.assignColorToCurrentImage(color);
            });
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        
        // Mouse events on image
        this.currentImage.addEventListener('wheel', (e) => this.handleWheel(e));
        this.currentImage.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
        this.currentImage.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.currentImage.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.currentImage.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        
        // Prevent context menu on images
        this.currentImage.addEventListener('contextmenu', (e) => e.preventDefault());
        
        // Load event
        this.currentImage.addEventListener('load', () => {
            document.getElementById('imageLoading').style.display = 'none';
            this.updateImageInfo();
        });
        
        this.currentImage.addEventListener('error', () => {
            document.getElementById('imageLoading').style.display = 'none';
            console.error('Failed to load image');
        });
        
        // Handle window resize
        window.addEventListener('resize', () => {
            if (this.zoomLevel > 1.0) {
                this.constrainPan();
                this.applyTransform();
            }
        });
    }
    
    updateDisplay() {
        if (this.images.length === 0) return;
        
        const image = this.images[this.currentIndex];
        const imageElement = this.currentImage;
        
        // Show loading
        document.getElementById('imageLoading').style.display = 'block';
        
        // Update counter
        document.getElementById('imageCounter').textContent = `${this.currentIndex + 1} / ${this.images.length}`;
        
        // Update navigation buttons
        document.getElementById('prevImage').disabled = this.currentIndex === 0;
        document.getElementById('nextImage').disabled = this.currentIndex === this.images.length - 1;
        
        // Load image
        imageElement.src = image.webviewPath;
        imageElement.alt = image.caption || `Image ${this.currentIndex + 1}`;
        
        // Reset zoom when changing images
        this.resetZoom();
        
        // Update color controls
        this.updateColorControls(image.color || '');
        
        console.log(`🖼️ Displaying image ${this.currentIndex + 1}: ${image.filename}`);
    }
    
    updateColorControls(currentColor) {
        document.querySelectorAll('.gallery-color-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.color === currentColor) {
                btn.classList.add('active');
            }
        });
    }
    
    updateImageInfo() {
        if (this.images.length === 0) return;
        
        const image = this.images[this.currentIndex];
        const imageElement = this.currentImage;
        
        // Update filename
        document.getElementById('imageFilename').textContent = image.filename || 'Unknown';
        
        // Update dimensions
        if (imageElement.naturalWidth && imageElement.naturalHeight) {
            document.getElementById('imageDimensions').textContent = 
                `${imageElement.naturalWidth} × ${imageElement.naturalHeight}`;
        }
    }
    
    previousImage() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.updateDisplay();
            this.preloadAdjacentImages();
        }
    }
    
    nextImage() {
        if (this.currentIndex < this.images.length - 1) {
            this.currentIndex++;
            this.updateDisplay();
            this.preloadAdjacentImages();
        }
    }
    
    preloadAdjacentImages() {
        // Preload previous and next images for smoother navigation
        const indicesToPreload = [this.currentIndex - 1, this.currentIndex + 1];
        
        indicesToPreload.forEach(index => {
            if (index >= 0 && index < this.images.length && !this.preloadedImages.has(index)) {
                const img = new Image();
                img.src = this.images[index].webviewPath;
                this.preloadedImages.set(index, img);
            }
        });
    }
    
    // Zoom and Pan functionality
    setZoom(newZoom) {
        this.zoomLevel = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));
        this.constrainPan();
        this.applyTransform();
        this.updateZoomIndicator();
        this.updateCursor();
    }
    
    zoomIn() {
        this.setZoom(this.zoomLevel + this.zoomStep);
    }
    
    zoomOut() {
        this.setZoom(this.zoomLevel - this.zoomStep);
    }
    
    resetZoom() {
        this.zoomLevel = 1.0;
        this.panX = 0;
        this.panY = 0;
        this.applyTransform();
        this.updateZoomIndicator();
        this.updateCursor();
    }
    
    applyTransform() {
        if (this.currentImage) {
            this.currentImage.style.transform = `scale(${this.zoomLevel}) translate(${this.panX / this.zoomLevel}px, ${this.panY / this.zoomLevel}px)`;
        }
    }
    
    updateZoomIndicator() {
        document.getElementById('zoomIndicator').textContent = Math.round(this.zoomLevel * 100) + '%';
    }
    
    updateCursor() {
        if (!this.currentImage) return;
        
        if (this.zoomLevel > 1.0) {
            this.currentImage.classList.add('zoomed');
        } else {
            this.currentImage.classList.remove('zoomed');
        }
    }
    
    // Color assignment
    assignColorToCurrentImage(color) {
        if (this.images.length === 0) return;
        
        const image = this.images[this.currentIndex];
        console.log(`🎨 Assigning color '${color}' to image:`, image.filename);
        
        // Update local state
        image.color = color;
        this.updateColorControls(color);
        
        // Send message to extension
        if (window.vscode) {
            window.vscode.postMessage({
                command: 'updateImageColor',
                data: {
                    imageId: image.id,
                    color: color
                }
            });
        }
    }
    
    // Event handlers
    handleKeyDown(event) {
        switch(event.key) {
            case 'ArrowLeft':
            case 'a':
            case 'A':
                event.preventDefault();
                this.previousImage();
                break;
            case 'ArrowRight':
            case 'd':
            case 'D':
                event.preventDefault();
                this.nextImage();
                break;
            case '=':
            case '+':
                event.preventDefault();
                this.zoomIn();
                break;
            case '-':
                event.preventDefault();
                this.zoomOut();
                break;
            case '0':
                event.preventDefault();
                if (event.ctrlKey || event.metaKey) {
                    this.resetZoom();
                } else {
                    this.assignColorToCurrentImage(''); // Clear color
                }
                break;
            case '1':
                event.preventDefault();
                this.assignColorToCurrentImage('green');
                break;
            case '2':
                event.preventDefault();
                this.assignColorToCurrentImage('blue');
                break;
            case '3':
                event.preventDefault();
                this.assignColorToCurrentImage('purple');
                break;
        }
    }
    
    handleWheel(event) {
        // Only handle wheel events with Cmd (Mac) or Ctrl (Win/Linux) key pressed
        if (!event.ctrlKey && !event.metaKey) {
            return;
        }
        
        event.preventDefault();
        
        // Normalize wheel delta across different browsers
        const delta = event.deltaY || event.detail || event.wheelDelta;
        const zoomDelta = delta > 0 ? -this.zoomStep : this.zoomStep;
        
        this.setZoom(this.zoomLevel + zoomDelta);
    }
    
    handleDoubleClick(event) {
        event.preventDefault();
        
        // Toggle between 100% and 200% zoom
        if (this.zoomLevel === 1.0) {
            this.setZoom(2.0);
        } else {
            this.resetZoom();
        }
    }
    
    handleMouseDown(event) {
        // Only enable dragging when zoomed in
        if (this.zoomLevel <= 1.0) return;
        
        event.preventDefault();
        this.isDragging = true;
        this.dragStartX = event.clientX;
        this.dragStartY = event.clientY;
        this.dragStartPanX = this.panX;
        this.dragStartPanY = this.panY;
        
        this.updateCursor();
    }
    
    handleMouseMove(event) {
        if (!this.isDragging || this.zoomLevel <= 1.0) return;
        
        event.preventDefault();
        
        const deltaX = event.clientX - this.dragStartX;
        const deltaY = event.clientY - this.dragStartY;
        
        this.panX = this.dragStartPanX + deltaX;
        this.panY = this.dragStartPanY + deltaY;
        
        // Apply boundary constraints to prevent panning too far
        this.constrainPan();
        
        this.applyTransform();
    }
    
    handleMouseUp(event) {
        if (!this.isDragging) return;
        
        this.isDragging = false;
        this.updateCursor();
    }
    
    constrainPan() {
        if (!this.currentImage) return;
        
        // Get image and container dimensions
        const container = document.getElementById('imageContainer');
        const containerRect = container.getBoundingClientRect();
        const imageRect = this.currentImage.getBoundingClientRect();
        
        // Calculate the scaled image dimensions
        const scaledWidth = imageRect.width;
        const scaledHeight = imageRect.height;
        
        // Calculate maximum pan distances to keep image visible
        const maxPanX = Math.max(0, (scaledWidth - containerRect.width) / 2);
        const maxPanY = Math.max(0, (scaledHeight - containerRect.height) / 2);
        
        // Constrain pan values
        this.panX = Math.max(-maxPanX, Math.min(maxPanX, this.panX));
        this.panY = Math.max(-maxPanY, Math.min(maxPanY, this.panY));
    }
}

// Initialize gallery when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🖼️ Initializing Gallery Viewer');
    new GalleryViewer();
});

// Handle messages from extension
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
        case 'imageColorUpdated':
            console.log('🎨 Image color updated:', message.data);
            // The color is already updated in the local state, so just log success
            break;
        case 'imageColorError':
            console.error('❌ Failed to update image color:', message.data.error);
            break;
        default:
            console.warn('Unknown message from extension:', message);
    }
});