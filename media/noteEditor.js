(function() {
    'use strict';

    // Global state
    let currentNote = null;
    let quill = null;
    let isLoadingEditorContent = false;
    let isDirty = false;
    let autoSaveTimeout = null;
    let currentColorFilter = 'all';

    // Initialize when DOM is loaded
    document.addEventListener('DOMContentLoaded', function() {
        initializeEditor();
        initializeQuill();
        setupEventListeners();
        setupAutoSave();
        
        // Load initial note data
        if (typeof window.noteData !== 'undefined' && window.noteData) {
            console.log('📄 Loading note data:', window.noteData);
            loadNoteData(window.noteData);
        } else {
            console.warn('⚠️ No note data available');
            
            // Note: Removed state restoration - using simpler approach where each panel gets fresh data
        }
    });

    function initializeEditor() {
        console.log('🔧 Initializing Notes editor...');
        
        // Set up VS Code API
        try {
            if (typeof acquireVsCodeApi !== 'undefined') {
                window.vscode = acquireVsCodeApi();
                console.log('✅ VS Code API acquired successfully');
            } else {
                console.error('❌ acquireVsCodeApi is not available');
            }
        } catch (error) {
            console.error('❌ Error acquiring VS Code API:', error);
        }
        
        // Set initial focus
        const titleInput = document.getElementById('noteTitle');
        if (titleInput && !titleInput.value.trim()) {
            titleInput.focus();
            console.log('🔍 Focus set on title input');
        }
        
        console.log('✅ Editor initialization complete');
    }

    function initializeQuill() {
        const editorContainer = document.getElementById('contentEditor');
        if (!editorContainer) {
            console.error('❌ Content editor container not found');
            return;
        }

        if (typeof Quill === 'undefined') {
            console.error('❌ Quill library is not available');
            return;
        }

        quill = new Quill(editorContainer, {
            theme: 'snow',
            placeholder: 'Write your note here...',
            modules: {
                toolbar: [
                    [{ header: [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ list: 'ordered' }, { list: 'bullet' }],
                    [{ color: [] }, { background: [] }],
                    [{ align: [] }],
                    ['link', 'code-block'],
                    ['clean']
                ]
            }
        });

        // Get reference to the scrollable container
        const scrollContainer = document.querySelector('.editor-content');
        let savedScrollPosition = null;

        // Preserve scroll position before text changes
        quill.on('text-change', (delta, oldDelta, source) => {
            if (isLoadingEditorContent) {
                return;
            }

            // Save scroll position before content update
            if (scrollContainer && source === 'user') {
                savedScrollPosition = scrollContainer.scrollTop;
            }

            markDirty();

            // Restore scroll position after content update
            if (scrollContainer && savedScrollPosition !== null && source === 'user') {
                requestAnimationFrame(() => {
                    scrollContainer.scrollTop = savedScrollPosition;
                    savedScrollPosition = null;
                });
            }
        });

        console.log('🪶 Quill editor initialized');
    }

    function setupEventListeners() {
        console.log('🎯 Setting up event listeners...');
        
        try {
            // Toolbar buttons
            const saveBtn = document.getElementById('saveBtn');
            const deleteBtn = document.getElementById('deleteBtn');
            const addImageBtn = document.getElementById('addImageBtn');
            const linkCodeBtn = document.getElementById('linkCodeBtn');
            
            if (saveBtn) {
                saveBtn.addEventListener('click', function() {
                    console.log('💾 Save button clicked');
                    saveNote();
                });
                console.log('✅ Save button listener added');
            } else {
                console.error('❌ Save button not found');
            }
            
            if (deleteBtn) {
                deleteBtn.addEventListener('click', function() {
                    console.log('🗑️ Delete button clicked');
                    deleteNote();
                });
                console.log('✅ Delete button listener added');
            } else {
                console.error('❌ Delete button not found');
            }
            
            if (addImageBtn) {
                addImageBtn.addEventListener('click', function() {
                    console.log('🖼️ Add Image button clicked');
                    addImage();
                });
                console.log('✅ Add Image button listener added');
            } else {
                console.error('❌ Add Image button not found');
            }
            
            if (linkCodeBtn) {
                linkCodeBtn.addEventListener('click', function() {
                    console.log('🔗 Link Code button clicked');
                    linkToCode();
                });
                console.log('✅ Link Code button listener added');
            } else {
                console.error('❌ Link Code button not found');
            }
        
            // Form inputs
            const titleInput = document.getElementById('noteTitle');
            const pinnedCheckbox = document.getElementById('pinnedCheckbox');
            
            if (titleInput) {
                titleInput.addEventListener('input', markDirty);
                console.log('✅ Title input listener added');
            }
            
            if (pinnedCheckbox) {
                pinnedCheckbox.addEventListener('change', markDirty);
                console.log('✅ Pinned checkbox listener added');
            }
            
            // Tags input
            const tagsInput = document.getElementById('tagsInput');
            if (tagsInput) {
                tagsInput.addEventListener('keydown', handleTagsInput);
                tagsInput.addEventListener('input', handleTagsInputChange);
                console.log('✅ Tags input listeners added');
            } else {
                console.error('❌ Tags input not found');
            }
            
        } catch (error) {
            console.error('❌ Error setting up event listeners:', error);
        }
        
        console.log('✅ Event listeners setup complete');
        
        // Tag removal
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('remove-tag')) {
                removeTag(e.target.dataset.tag);
            }
        });
        
        // Image operations
        document.addEventListener('click', function(e) {
            // Check if clicked element or its parent is the remove button
            const removeButton = e.target.classList.contains('remove-image') ? 
                e.target : 
                e.target.closest('.remove-image');
                
            if (removeButton) {
                removeImage(removeButton.dataset.imageId);
            } else if (e.target.classList.contains('thumbnail')) {
                viewFullImage(e.target);
            }
        });
        
        // Image right-click context menu
        document.addEventListener('contextmenu', function(e) {
            if (e.target.classList.contains('thumbnail')) {
                e.preventDefault(); // Prevent default context menu
                
                const imageItem = e.target.closest('.image-item');
                const imageId = imageItem.dataset.imageId;
                
                showImageContextMenu(e, imageId);
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', handleKeyboardShortcuts);
        
        // Paste handling for images
        document.addEventListener('paste', handlePaste);
        
        // Listen for messages from extension
        if (window.vscode) {
            window.addEventListener('message', handleExtensionMessage);
        }
    }

    function setupAutoSave() {
        const autoSaveInterval = 30000; // 30 seconds
        
        setInterval(() => {
            if (isDirty) {
                saveNote(true); // Silent auto-save
            }
        }, autoSaveInterval);
    }

    function loadNoteData(data) {
        currentNote = data;
        
        // Note: Removed state management - using simpler file-like approach for split editor
        
        // Populate form fields
        document.getElementById('noteTitle').value = data.title || '';
        setEditorContent(data.content || '');
        document.getElementById('pinnedCheckbox').checked = !!data.isPinned;
        
        // Load tags
        loadTags(data.tags || []);
        
        // Load images
        loadImages(data.images || []);
        
        // Load linked files
        loadLinkedFiles(data.linkedFiles || []);
        
        // Reset dirty state
        isDirty = false;
        updateSaveButtonState();
    }

    function loadTags(tags) {
        const container = document.getElementById('tagsContainer');
        container.innerHTML = '';
        
        tags.forEach(tag => {
            addTagToContainer(tag);
        });
    }

    function loadImages(images) {
        const gallery = document.getElementById('imageGallery');
        
        if (images.length === 0) {
            gallery.innerHTML = '<p class="empty-gallery">No images yet. Click "Add Image" or paste from clipboard.</p>';
            return;
        }
        
        const imagesHtml = `
            <div class="images-header">
                <h3>Images (${images.length})</h3>
                <button class="btn-small btn-gallery" id="openGalleryBtn" title="Open image gallery in right editor">
                    📸 Gallery
                </button>
            </div>
            <div class="color-filters">
                <button class="filter-btn active" data-color="all">All</button>
                <button class="filter-btn" data-color="green">Green</button>
                <button class="filter-btn" data-color="blue">Blue</button>
                <button class="filter-btn" data-color="purple">Purple</button>
            </div>
            <div class="images-grid">
                ${images.map((img, index) => `
                    <div class="image-item ${img.color ? `color-${img.color}` : ''}" data-image-id="${img.id}" data-color="${img.color || ''}">
                        <div class="image-counter">${index + 1}/${images.length}</div>
                        <img src="${img.thumbnailPath || img.webviewPath}" alt="${escapeHtml(img.caption || 'Note image')}" class="thumbnail" data-full-image="${img.webviewPath}" />
                        <div class="image-controls">
                            <button class="btn-small btn-danger remove-image" data-image-id="${img.id}">
                                <img src="${iconUri}/delete.svg" alt="Remove" />
                            </button>
                        </div>
                        ${img.caption ? `<p class="image-caption">${escapeHtml(img.caption)}</p>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
        
        gallery.innerHTML = imagesHtml;
        
        // Set up color filters
        setupColorFilters();
        
        // Set up gallery button
        setupGalleryButton();
        
        // Apply current filter
        applyColorFilter(currentColorFilter);
    }

    function loadLinkedFiles(linkedFiles) {
        const container = document.getElementById('linkedFiles');
        
        if (linkedFiles.length === 0) {
            container.innerHTML = '';
            return;
        }
        
        const filesHtml = `
            <div class="linked-files-section">
                <h3>Linked Files (${linkedFiles.length})</h3>
                <div class="linked-files-list">
                    ${linkedFiles.map(file => `
                        <div class="linked-file" data-file-path="${escapeHtml(file.path)}">
                            <span class="file-path">${escapeHtml(file.path)}</span>
                            ${file.line ? `<span class="file-line">:${file.line}</span>` : ''}
                            ${file.description ? `<span class="file-description">${escapeHtml(file.description)}</span>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        
        container.innerHTML = filesHtml;
    }

    function setEditorContent(content) {
        if (quill) {
            isLoadingEditorContent = true;
            if (!content) {
                quill.setText('', 'silent');
            } else if (looksLikeHtml(content)) {
                const delta = quill.clipboard.convert(content);
                quill.setContents(delta, 'silent');
            } else {
                quill.setText(content, 'silent');
            }
            quill.setSelection(quill.getLength(), 0, 'silent');
            isLoadingEditorContent = false;
        } else {
            const fallbackEditor = document.getElementById('contentEditor');
            if (fallbackEditor) {
                fallbackEditor.textContent = content;
            }
        }
    }

    function getEditorHtml() {
        if (quill) {
            if (quill.getLength() <= 1) {
                return '';
            }
            return quill.root.innerHTML;
        }

        const fallbackEditor = document.getElementById('contentEditor');
        return fallbackEditor ? fallbackEditor.textContent || '' : '';
    }

    function getEditorPlainText() {
        if (quill) {
            return quill.getText().trim();
        }

        const fallbackEditor = document.getElementById('contentEditor');
        return fallbackEditor ? (fallbackEditor.textContent || '').trim() : '';
    }

    function looksLikeHtml(value) {
        return /<\/?[a-z][\s\S]*>/i.test(value.trim());
    }

    function markDirty() {
        if (!isDirty) {
            isDirty = true;
            updateSaveButtonState();
        }
    }

    function updateSaveButtonState() {
        const saveBtn = document.getElementById('saveBtn');
        if (isDirty) {
            saveBtn.textContent = '💾 Save*';
            saveBtn.classList.add('btn-primary');
        } else {
            saveBtn.textContent = '💾 Saved';
            saveBtn.classList.remove('btn-primary');
        }
    }

    function saveNote(silent = false) {
        console.log('💾 saveNote function called, silent:', silent);
        
        try {
            const data = {
                title: document.getElementById('noteTitle').value.trim() || 'Untitled Note',
                content: getEditorHtml(),
                tags: getCurrentTags(),
                isPinned: document.getElementById('pinnedCheckbox').checked
            };
            
            console.log('📝 Note data to save:', data);
            
            if (window.vscode) {
                console.log('📨 Posting message to VS Code extension');
                window.vscode.postMessage({
                    command: 'saveNote',
                    data: data
                });
            } else {
                console.error('❌ VS Code API not available');
                showNotification('Error: VS Code API not available', 'error');
                return;
            }
            
            if (!silent) {
                showNotification('Saving note...');
            }
        } catch (error) {
            console.error('❌ Error in saveNote:', error);
            showNotification('Error saving note: ' + error.message, 'error');
        }
    }

    function deleteNote() {
        if (confirm('Are you sure you want to delete this note? This action cannot be undone.')) {
            if (window.vscode) {
                window.vscode.postMessage({
                    command: 'deleteNote'
                });
            }
        }
    }

    function addImage() {
        console.log('🖼️ addImage function called');
        
        try {
            if (window.vscode) {
                console.log('📨 Posting addImage message to VS Code extension');
                window.vscode.postMessage({
                    command: 'addImage',
                    data: {}
                });
                showNotification('Paste an image from clipboard or add one...');
            } else {
                console.error('❌ VS Code API not available for addImage');
                showNotification('Error: VS Code API not available', 'error');
            }
        } catch (error) {
            console.error('❌ Error in addImage:', error);
            showNotification('Error adding image: ' + error.message, 'error');
        }
    }

    function removeImage(imageId) {
        console.log('🗑️ Remove image requested for ID:', imageId);
        if (window.vscode) {
            window.vscode.postMessage({
                command: 'removeImage',
                data: { imageId }
            });
            console.log('📤 Remove image message sent to extension');
        } else {
            console.error('❌ window.vscode not available for image removal');
        }
    }

    // Image Modal Class for navigation between images
    class ImageModal {
        constructor(images, startIndex = 0) {
            this.images = images || [];
            this.currentIndex = startIndex;
            this.modal = null;
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
            
            console.log(`🖼️ Opening image modal: ${this.currentIndex + 1} of ${this.images.length}`);
            
            if (this.images.length === 0) {
                console.warn('⚠️ No images available for modal');
                return;
            }
            
            this.createModal();
            this.attachEventListeners();
            this.preloadAdjacentImages();
            this.updateDisplay();
        }
        
        createModal() {
            // Create modal overlay
            this.modal = document.createElement('div');
            this.modal.className = 'image-modal-overlay';
            this.modal.innerHTML = `
                <div class="image-modal-container">
                    <div class="image-modal-header">
                        <div class="image-modal-counter">
                            <span id="imageCounter">${this.currentIndex + 1} / ${this.images.length}</span>
                        </div>
                        <div class="image-modal-zoom-controls">
                            <button class="zoom-btn" id="zoomOut" aria-label="Zoom Out" title="Zoom Out (- or Ctrl+Mouse Wheel)">−</button>
                            <span class="zoom-indicator" id="zoomIndicator">100%</span>
                            <button class="zoom-btn" id="zoomIn" aria-label="Zoom In" title="Zoom In (+ or Ctrl+Mouse Wheel)">+</button>
                            <button class="zoom-btn" id="zoomReset" aria-label="Reset Zoom" title="Reset Zoom (Double-click)">⌂</button>
                        </div>
                        <div class="image-modal-color-controls">
                            <button class="color-btn" data-color="green" title="Assign Green (Press 1)">●</button>
                            <button class="color-btn" data-color="blue" title="Assign Blue (Press 2)">●</button>
                            <button class="color-btn" data-color="purple" title="Assign Purple (Press 3)">●</button>
                            <button class="color-btn clear-color" data-color="" title="Clear Color (Press 0)">○</button>
                        </div>
                        <button class="image-modal-close" id="closeModal" aria-label="Close">✕</button>
                    </div>
                    <div class="image-modal-body">
                        <button class="image-modal-nav image-modal-prev" id="prevImage" aria-label="Previous image">‹</button>
                        <div class="image-modal-content" id="imageContainer">
                            <img id="modalImage" class="image-modal-image" alt="Full size image" />
                            <div class="image-modal-loading" id="imageLoading">Loading...</div>
                        </div>
                        <button class="image-modal-nav image-modal-next" id="nextImage" aria-label="Next image">›</button>
                    </div>
                    <div class="image-modal-footer">
                        <div class="image-modal-info">
                            <span id="imageFilename"></span>
                            <span id="imageDimensions"></span>
                            <span class="zoom-hint">Tip: Cmd/Ctrl + Mouse Wheel to zoom, drag to pan</span>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(this.modal);
            this.currentImage = document.getElementById('modalImage');
        }
        
        attachEventListeners() {
            // Close button
            document.getElementById('closeModal').addEventListener('click', () => this.close());
            
            // Navigation buttons
            document.getElementById('prevImage').addEventListener('click', () => this.navigate(-1));
            document.getElementById('nextImage').addEventListener('click', () => this.navigate(1));
            
            // Zoom control buttons
            document.getElementById('zoomIn').addEventListener('click', () => this.zoomIn());
            document.getElementById('zoomOut').addEventListener('click', () => this.zoomOut());
            document.getElementById('zoomReset').addEventListener('click', () => this.resetZoom());
            
            // Color button click handlers
            document.querySelectorAll('.color-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const color = btn.dataset.color;
                    this.assignColorToCurrentImage(color);
                });
            });
            
            // Click outside to close
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) {
                    this.close();
                }
            });
            
            // Mouse wheel zoom (Cmd/Ctrl + wheel)
            this.wheelHandler = (e) => this.handleWheel(e);
            this.modal.addEventListener('wheel', this.wheelHandler, { passive: false });
            
            // Mouse drag for panning
            this.mouseDownHandler = (e) => this.handleMouseDown(e);
            this.mouseMoveHandler = (e) => this.handleMouseMove(e);
            this.mouseUpHandler = (e) => this.handleMouseUp(e);
            
            this.currentImage.addEventListener('mousedown', this.mouseDownHandler);
            document.addEventListener('mousemove', this.mouseMoveHandler);
            document.addEventListener('mouseup', this.mouseUpHandler);
            
            // Double-click to toggle zoom
            this.doubleClickHandler = (e) => this.handleDoubleClick(e);
            this.currentImage.addEventListener('dblclick', this.doubleClickHandler);
            
            // Right-click context menu
            this.contextMenuHandler = (e) => this.handleContextMenu(e);
            this.currentImage.addEventListener('contextmenu', this.contextMenuHandler);
            
            // Keyboard navigation and zoom
            this.keyboardHandler = (e) => this.handleKeyboard(e);
            document.addEventListener('keydown', this.keyboardHandler);
            
            // Image load events
            this.currentImage.onload = () => {
                this.hideLoading();
                
                // Always set to 100% zoom and center positioning
                this.zoomLevel = 1.0;
                this.panX = 0;
                this.panY = 0;
                this.setImagePosition('center');
                this.disableScrollMode();
                
                this.applyTransform();
                this.updateZoomIndicator();
                this.updateCursor();
                
                console.log('📏 Image loaded at 100% zoom');
            };
            this.currentImage.onerror = () => this.handleImageError();
        }
        
        handleKeyboard(event) {
            switch (event.key) {
                case 'Escape':
                    this.close();
                    break;
                case 'ArrowLeft':
                case 'ArrowUp':
                    event.preventDefault();
                    this.navigate(-1);
                    break;
                case 'ArrowRight':
                case 'ArrowDown':
                case ' ':
                    event.preventDefault();
                    this.navigate(1);
                    break;
                case '+':
                case '=':
                    event.preventDefault();
                    this.zoomIn();
                    break;
                case '-':
                case '_':
                    event.preventDefault();
                    this.zoomOut();
                    break;
                case '0':
                    if (event.ctrlKey || event.metaKey) {
                        event.preventDefault();
                        this.resetZoom();
                    } else {
                        event.preventDefault();
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
        
        handleContextMenu(event) {
            event.preventDefault(); // Prevent default context menu
            
            if (this.images.length === 0) return;
            
            // Get the current image ID
            const currentImage = this.images[this.currentIndex];
            const imageId = currentImage.id;
            
            console.log('🖼️ Right-click on modal image:', imageId);
            
            // Show the same context menu as thumbnails
            showImageContextMenu(event, imageId);
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
        
        navigate(direction) {
            if (this.images.length <= 1) return;
            
            const newIndex = (this.currentIndex + direction + this.images.length) % this.images.length;
            console.log(`🔄 Navigating: ${this.currentIndex} → ${newIndex}`);
            
            this.currentIndex = newIndex;
            
            // Reset zoom and pan when changing images
            this.resetZoom();
            
            this.updateDisplay();
            this.preloadAdjacentImages();
        }
        
        updateDisplay() {
            const image = this.images[this.currentIndex];
            if (!image) return;
            
            // Show loading
            this.showLoading();
            
            // Update counter
            document.getElementById('imageCounter').textContent = `${this.currentIndex + 1} / ${this.images.length}`;
            
            // Update navigation button states
            const prevBtn = document.getElementById('prevImage');
            const nextBtn = document.getElementById('nextImage');
            
            if (this.images.length === 1) {
                prevBtn.style.display = 'none';
                nextBtn.style.display = 'none';
            } else {
                prevBtn.style.display = 'flex';
                nextBtn.style.display = 'flex';
            }
            
            // Apply color frame to modal image
            this.applyColorFrame(image.color);
            
            // Update color button states to show current color
            this.updateColorButtonStates(image.color);
            
            // Set image source
            this.loadImage(image);
            
            // Update filename
            document.getElementById('imageFilename').textContent = image.filename || 'Unknown file';
            
            // Update dimensions if available
            const dimensionsElement = document.getElementById('imageDimensions');
            if (image.dimensions) {
                dimensionsElement.textContent = `${image.dimensions.width} × ${image.dimensions.height}`;
            } else {
                dimensionsElement.textContent = '';
            }
        }
        
        loadImage(image) {
            let imageSrc = image.webviewPath;
            
            // Fallback logic
            if (!imageSrc) {
                console.warn('⚠️ No webviewPath found, using fallback');
                imageSrc = image.thumbnailPath?.replace('/thumb-', '/image-');
                
                if (imageSrc?.includes('/image-') && imageSrc.endsWith('.jpg')) {
                    imageSrc = imageSrc.replace('.jpg', '.png');
                }
            }
            
            console.log('🖼️ Loading image:', imageSrc);
            this.currentImage.src = imageSrc;
        }
        
        handleImageError() {
            console.error('❌ Failed to load image');
            this.hideLoading();
            
            const image = this.images[this.currentIndex];
            let imageSrc = this.currentImage.src;
            
            // Try alternative extensions
            if (imageSrc.endsWith('.png')) {
                console.log('🔄 Trying .jpg extension');
                this.currentImage.src = imageSrc.replace('.png', '.jpg');
            } else if (imageSrc.endsWith('.jpg')) {
                console.log('🔄 Trying .png extension');
                this.currentImage.src = imageSrc.replace('.jpg', '.png');
            }
        }
        
        showLoading() {
            document.getElementById('imageLoading').style.display = 'flex';
        }
        
        hideLoading() {
            document.getElementById('imageLoading').style.display = 'none';
        }
        
        preloadAdjacentImages() {
            // Preload next and previous images for smooth navigation
            const indicesToPreload = [
                (this.currentIndex - 1 + this.images.length) % this.images.length,
                (this.currentIndex + 1) % this.images.length
            ];
            
            indicesToPreload.forEach(index => {
                if (index === this.currentIndex || this.preloadedImages.has(index)) return;
                
                const image = this.images[index];
                if (!image || !image.webviewPath) return;
                
                const img = new Image();
                img.src = image.webviewPath;
                this.preloadedImages.set(index, img);
            });
        }
        
        // Zoom methods
        zoomIn() {
            this.setZoom(this.zoomLevel + this.zoomStep);
        }
        
        zoomOut() {
            this.setZoom(this.zoomLevel - this.zoomStep);
        }
        
        setZoom(newZoom) {
            // Clamp zoom level between min and max
            const clampedZoom = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));
            
            if (clampedZoom === this.zoomLevel) return;
            
            this.zoomLevel = clampedZoom;
            this.applyTransform();
            this.updateZoomIndicator();
            this.updateCursor();
            
            // Reset pan position if zooming out to 100% or less
            if (this.zoomLevel <= 1.0) {
                this.panX = 0;
                this.panY = 0;
            }
        }
        
        resetZoom() {
            this.zoomLevel = 1.0;
            this.panX = 0;
            this.panY = 0;
            
            // Reset to center positioning when zoom is reset
            this.setImagePosition('center');
            
            this.applyTransform();
            this.updateZoomIndicator();
            this.updateCursor();
        }
        
        applyTransform() {
            if (this.currentImage) {
                const transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoomLevel})`;
                this.currentImage.style.transform = transform;
                
                // Use the positioning set by setImagePosition
                // Default to center center if no positioning was set
                if (!this.currentImage.style.transformOrigin) {
                    this.currentImage.style.transformOrigin = 'center center';
                }
            }
        }
        
        setImagePosition(position) {
            if (!this.currentImage) return;
            
            switch (position) {
                case 'top':
                    this.currentImage.style.transformOrigin = 'center top';
                    break;
                case 'center':
                    this.currentImage.style.transformOrigin = 'center center';
                    break;
                case 'bottom':
                    this.currentImage.style.transformOrigin = 'center bottom';
                    break;
                default:
                    this.currentImage.style.transformOrigin = 'center center';
            }
        }
        
        updateZoomIndicator() {
            const indicator = document.getElementById('zoomIndicator');
            if (indicator) {
                indicator.textContent = `${Math.round(this.zoomLevel * 100)}%`;
            }
            
            // Update zoom button states
            const zoomInBtn = document.getElementById('zoomIn');
            const zoomOutBtn = document.getElementById('zoomOut');
            
            if (zoomInBtn) {
                zoomInBtn.disabled = this.zoomLevel >= this.maxZoom;
            }
            if (zoomOutBtn) {
                zoomOutBtn.disabled = this.zoomLevel <= this.minZoom;
            }
        }
        
        updateCursor() {
            if (this.currentImage) {
                if (this.zoomLevel > 1.0) {
                    this.currentImage.style.cursor = this.isDragging ? 'grabbing' : 'grab';
                } else {
                    this.currentImage.style.cursor = 'zoom-in';
                }
            }
        }
        
        applyColorFrame(color) {
            if (!this.currentImage) return;
            
            const modalContainer = document.querySelector('.image-modal-container');
            
            // Remove existing color classes from both image and modal container
            this.currentImage.classList.remove('color-green', 'color-blue', 'color-purple');
            if (modalContainer) {
                modalContainer.classList.remove('modal-color-green', 'modal-color-blue', 'modal-color-purple');
            }
            
            // Add new color class if color is set
            if (color) {
                this.currentImage.classList.add(`color-${color}`);
                if (modalContainer) {
                    modalContainer.classList.add(`modal-color-${color}`);
                }
                console.log(`🎨 Applied ${color} frame to modal image and container`);
            }
        }
        
        
        enableScrollMode() {
            const modalBody = document.querySelector('.image-modal-body');
            const modalContent = document.getElementById('imageContainer');
            
            if (modalBody && modalContent) {
                modalBody.classList.add('scrollable-mode');
                modalContent.classList.add('scrollable-mode');
                this.currentImage.classList.add('tall-image');
                
                // Update hint text
                const hintElement = document.querySelector('.zoom-hint');
                if (hintElement) {
                    hintElement.textContent = 'Tip: Scroll to navigate tall image, Cmd/Ctrl + Mouse Wheel to zoom';
                }
                
                console.log('📜 Enabled scroll mode for tall image');
            }
        }
        
        disableScrollMode() {
            const modalBody = document.querySelector('.image-modal-body');
            const modalContent = document.getElementById('imageContainer');
            
            if (modalBody && modalContent) {
                modalBody.classList.remove('scrollable-mode');
                modalContent.classList.remove('scrollable-mode');
                if (this.currentImage) {
                    this.currentImage.classList.remove('tall-image');
                }
                
                // Reset hint text
                const hintElement = document.querySelector('.zoom-hint');
                if (hintElement) {
                    hintElement.textContent = 'Tip: Use mouse wheel with Cmd/Ctrl to zoom, drag to pan when zoomed';
                }
                
                console.log('📜 Disabled scroll mode');
            }
        }
        
        assignColorToCurrentImage(color) {
            const image = this.images[this.currentIndex];
            if (!image) {
                console.warn('❌ No current image to assign color to');
                return;
            }
            
            console.log(`🎨 Assigning color ${color || 'none'} to image ${image.id}`);
            
            // Update local image data
            if (color) {
                image.color = color;
            } else {
                delete image.color;
            }
            
            // Apply visual frame immediately
            this.applyColorFrame(color);
            
            // Send update to backend
            if (window.vscode) {
                window.vscode.postMessage({
                    command: 'updateImageColor',
                    data: {
                        imageId: image.id,
                        color: color
                    }
                });
                console.log(`📤 Sent color update to backend: ${image.id} -> ${color || 'none'}`);
            }
            
            // Update button states
            this.updateColorButtonStates(color);
        }
        
        updateColorButtonStates(activeColor) {
            // Remove active class from all buttons
            const colorBtns = document.querySelectorAll('.color-btn');
            colorBtns.forEach(btn => {
                btn.classList.remove('active');
            });
            
            // Add active class to current color button
            if (activeColor) {
                const activeBtn = document.querySelector(`.color-btn[data-color="${activeColor}"]`);
                if (activeBtn) {
                    activeBtn.classList.add('active');
                }
            } else {
                // If no color, highlight the clear button
                const clearBtn = document.querySelector('.color-btn.clear-color');
                if (clearBtn) {
                    clearBtn.classList.add('active');
                }
            }
        }
        
        close() {
            console.log('🔄 Closing image modal');
            
            // Remove event listeners
            if (this.keyboardHandler) {
                document.removeEventListener('keydown', this.keyboardHandler);
            }
            if (this.wheelHandler) {
                this.modal.removeEventListener('wheel', this.wheelHandler);
            }
            if (this.mouseDownHandler) {
                this.currentImage.removeEventListener('mousedown', this.mouseDownHandler);
            }
            if (this.mouseMoveHandler) {
                document.removeEventListener('mousemove', this.mouseMoveHandler);
            }
            if (this.mouseUpHandler) {
                document.removeEventListener('mouseup', this.mouseUpHandler);
            }
            if (this.doubleClickHandler) {
                this.currentImage.removeEventListener('dblclick', this.doubleClickHandler);
            }
            if (this.contextMenuHandler) {
                this.currentImage.removeEventListener('contextmenu', this.contextMenuHandler);
            }
            
            // Remove modal from DOM
            if (this.modal && this.modal.parentNode) {
                document.body.removeChild(this.modal);
            }
            
            // Clear preloaded images
            this.preloadedImages.clear();
        }
    }

    function viewFullImage(thumbnail) {
        // Find the clicked image in the current note's images array
        if (!currentNote || !currentNote.images) {
            console.warn('⚠️ No current note or images available');
            return;
        }
        
        // Find the index of the clicked image
        const imageId = thumbnail.closest('.image-item').dataset.imageId;
        const imageIndex = currentNote.images.findIndex(img => img.id === imageId);
        
        if (imageIndex === -1) {
            console.warn('⚠️ Could not find clicked image in note data');
            return;
        }
        
        // Open modal with the clicked image
        new ImageModal(currentNote.images, imageIndex);
    }

    function showImageContextMenu(event, imageId) {
        // Remove any existing context menu
        const existingMenu = document.querySelector('.image-context-menu');
        if (existingMenu) {
            existingMenu.remove();
        }

        // Create context menu
        const menu = document.createElement('div');
        menu.className = 'image-context-menu';
        menu.style.position = 'absolute';
        menu.style.left = event.pageX + 'px';
        menu.style.top = event.pageY + 'px';
        menu.style.backgroundColor = 'var(--vscode-menu-background)';
        menu.style.border = '1px solid var(--vscode-menu-border)';
        menu.style.borderRadius = '3px';
        menu.style.boxShadow = '0 2px 8px var(--vscode-widget-shadow)';
        // Use higher z-index if we're in a modal context (modal has z-index: 10000)
        menu.style.zIndex = document.querySelector('.image-modal-overlay') ? '10001' : '1000';
        menu.style.minWidth = '180px';
        menu.style.padding = '4px 0';

        // Menu items
        const menuItems = [
            {
                text: '🖼️ Open in Right Editor',
                action: () => openImageInRightEditor(imageId)
            },
            {
                text: '📸 Open Gallery in Right Editor',
                action: () => openImageGalleryInRightEditor()
            },
            {
                text: '🔍 View Full Size',
                action: () => {
                    const thumbnail = document.querySelector(`[data-image-id="${imageId}"] .thumbnail`);
                    if (thumbnail) {
                        viewFullImage(thumbnail);
                    }
                }
            }
        ];

        menuItems.forEach(item => {
            const menuItem = document.createElement('div');
            menuItem.className = 'context-menu-item';
            menuItem.textContent = item.text;
            menuItem.style.padding = '6px 12px';
            menuItem.style.cursor = 'pointer';
            menuItem.style.color = 'var(--vscode-menu-foreground)';
            
            menuItem.addEventListener('mouseenter', () => {
                menuItem.style.backgroundColor = 'var(--vscode-menu-selectionBackground)';
            });
            
            menuItem.addEventListener('mouseleave', () => {
                menuItem.style.backgroundColor = 'transparent';
            });
            
            menuItem.addEventListener('click', () => {
                item.action();
                menu.remove();
            });
            
            menu.appendChild(menuItem);
        });

        document.body.appendChild(menu);

        // Close menu when clicking elsewhere
        setTimeout(() => {
            document.addEventListener('click', function closeMenu() {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            });
        }, 0);
    }

    function openImageInRightEditor(imageId) {
        console.log('📤 Sending openImageInRightEditor message for image:', imageId);
        if (window.vscode) {
            window.vscode.postMessage({
                command: 'openImageInRightEditor',
                data: { imageId: imageId }
            });
        }
    }

    function openImageGalleryInRightEditor() {
        console.log('📤 Sending openImageGalleryInRightEditor message');
        if (window.vscode) {
            window.vscode.postMessage({
                command: 'openImageGalleryInRightEditor',
                data: {}
            });
        }
    }

    function linkToCode() {
        if (window.vscode) {
            window.vscode.postMessage({
                command: 'linkToCode',
                data: {}
            });
        }
    }

    function handleTagsInput(e) {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const tag = e.target.value.trim();
            if (tag && !hasTag(tag)) {
                addTag(tag);
                e.target.value = '';
                markDirty();
            }
        }
    }

    function handleTagsInputChange(e) {
        const query = e.target.value.trim();
        if (query.length > 1 && window.vscode) {
            // Request tag suggestions
            window.vscode.postMessage({
                command: 'searchTags',
                data: { query }
            });
        }
    }

    function addTag(tag) {
        const cleanTag = tag.toLowerCase().trim();
        if (cleanTag && !hasTag(cleanTag)) {
            addTagToContainer(cleanTag);
            markDirty();
        }
    }

    function removeTag(tag) {
        const tagElement = document.querySelector(`[data-tag="${tag}"]`).parentElement;
        if (tagElement) {
            tagElement.remove();
            markDirty();
        }
    }

    function addTagToContainer(tag) {
        const container = document.getElementById('tagsContainer');
        const tagElement = document.createElement('span');
        tagElement.className = 'tag';
        tagElement.innerHTML = `${escapeHtml(tag)} <span class="remove-tag" data-tag="${escapeHtml(tag)}">×</span>`;
        container.appendChild(tagElement);
    }

    function hasTag(tag) {
        return getCurrentTags().includes(tag.toLowerCase());
    }

    function getCurrentTags() {
        const tags = [];
        document.querySelectorAll('.remove-tag').forEach(el => {
            tags.push(el.dataset.tag);
        });
        return tags;
    }

    function handleKeyboardShortcuts(e) {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case 's':
                    e.preventDefault();
                    saveNote();
                    break;
                case 'n':
                    if (e.altKey) {
                        e.preventDefault();
                        // Could add new note functionality
                    }
                    break;
            }
        }
    }

    function handlePaste(e) {
        const items = e.clipboardData?.items;
        if (!items) return;
        
        for (let item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                addImage(); // Trigger image add which will handle clipboard
                break;
            }
        }
    }

    function handleExtensionMessage(event) {
        const message = event.data;
        
        switch (message.command) {
            case 'addImage':
                // Handle F4 hotkey image paste trigger
                console.log('🔥 F4 hotkey triggered - adding image from clipboard');
                addImage();
                break;
                
            case 'cycleImageColor':
                // Handle Shift+F12 hotkey color cycling trigger
                console.log('🎨 Shift+F12 hotkey message received in webview');
                cycleLastImageColor();
                break;
                
            case 'saveSuccess':
                isDirty = false;
                updateSaveButtonState();
                if (currentNote) {
                    currentNote.title = document.getElementById('noteTitle').value.trim() || currentNote.title;
                    currentNote.content = getEditorHtml();
                    currentNote.tags = getCurrentTags();
                    currentNote.isPinned = document.getElementById('pinnedCheckbox').checked;
                }
                showNotification('Note saved successfully', 'success');
                break;
                
            case 'saveError':
                showNotification('Failed to save note: ' + message.data.error, 'error');
                break;
                
            case 'imageAdded':
                // Reload images
                if (currentNote) {
                    currentNote.images.push(message.data.image);
                    loadImages(currentNote.images);
                }
                showNotification('Image added successfully', 'success');
                break;
                
            case 'imageRemoved':
                // Remove image from current data
                if (currentNote) {
                    currentNote.images = currentNote.images.filter(img => img.id !== message.data.imageId);
                    loadImages(currentNote.images);
                }
                showNotification('Image removed successfully', 'success');
                break;
                
            case 'imageError':
                showNotification('Image operation failed: ' + message.data.error, 'error');
                break;
                
            case 'tagSuggestions':
                showTagSuggestions(message.data.suggestions);
                break;
                
            case 'imageColorUpdated':
                // Handle successful image color update
                console.log('🎨 Image color updated:', message.data);
                updateImageColorDisplay(message.data.imageId, message.data.color);
                
                // Show notification with color name and cycle info
                const colorNames = {
                    undefined: 'None',
                    green: 'Green', 
                    blue: 'Blue',
                    purple: 'Purple'
                };
                const colorName = colorNames[message.data.color] || 'None';
                
                // Add cycle information if available
                let notificationText = `🎨 ${colorName} color assigned`;
                if (message.data.cycleInfo && message.data.cycleInfo.cycleIndex !== undefined) {
                    const cycleCounts = ['1st', '2nd', '3rd'];
                    const cycleIndex = message.data.cycleInfo.cycleIndex;
                    if (cycleIndex < cycleCounts.length) {
                        notificationText = `🎨 ${cycleCounts[cycleIndex]} cycle: ${colorName} color assigned`;
                    }
                }
                
                showNotification(notificationText, 'success');
                break;
                
            case 'imageColorError':
                showNotification('Failed to update image color: ' + message.data.error, 'error');
                break;
                
        }
    }

    function showTagSuggestions(suggestions) {
        // Remove existing suggestions
        const existing = document.querySelector('.tag-suggestions');
        if (existing) {
            existing.remove();
        }
        
        if (suggestions.length === 0) {
            return;
        }
        
        const tagsInput = document.getElementById('tagsInput');
        const container = document.createElement('div');
        container.className = 'tag-suggestions';
        container.style.cssText = `
            position: absolute;
            background: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 4px;
            margin-top: 2px;
            max-height: 200px;
            overflow-y: auto;
            z-index: 100;
        `;
        
        suggestions.slice(0, 10).forEach(tag => {
            const item = document.createElement('div');
            item.textContent = tag;
            item.style.cssText = `
                padding: 8px 12px;
                cursor: pointer;
                border-bottom: 1px solid var(--vscode-dropdown-border);
            `;
            
            item.addEventListener('click', () => {
                addTag(tag);
                tagsInput.value = '';
                container.remove();
            });
            
            item.addEventListener('mouseover', () => {
                item.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
            });
            
            item.addEventListener('mouseout', () => {
                item.style.backgroundColor = 'transparent';
            });
            
            container.appendChild(item);
        });
        
        tagsInput.parentElement.style.position = 'relative';
        tagsInput.parentElement.appendChild(container);
        
        // Remove suggestions when clicking outside
        setTimeout(() => {
            document.addEventListener('click', function removeSuggestions(e) {
                if (!container.contains(e.target) && e.target !== tagsInput) {
                    container.remove();
                    document.removeEventListener('click', removeSuggestions);
                }
            });
        }, 100);
    }

    function showNotification(message, type = 'info') {
        // Remove existing notification
        const existing = document.querySelector('.notification');
        if (existing) {
            existing.remove();
        }
        
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        
        const colors = {
            success: 'var(--vscode-notificationsInfoIcon-foreground)',
            error: 'var(--vscode-notificationsErrorIcon-foreground)',
            info: 'var(--vscode-notificationsInfoIcon-foreground)'
        };
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--vscode-notifications-background);
            color: var(--vscode-notifications-foreground);
            border: 1px solid var(--vscode-notifications-border);
            border-left: 4px solid ${colors[type]};
            border-radius: 4px;
            padding: 12px 16px;
            max-width: 300px;
            z-index: 1000;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 3000);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Color cycling functions
    function cycleLastImageColor() {
        console.log('🔄 cycleLastImageColor function called');
        console.log('📋 Current note:', currentNote);
        
        if (!currentNote || !currentNote.images || currentNote.images.length === 0) {
            console.warn('❌ No images to cycle color for');
            console.log('📊 Images length:', currentNote?.images?.length || 0);
            return;
        }

        const lastImage = currentNote.images[currentNote.images.length - 1];
        console.log('🖼️ Last image:', lastImage);
        
        const colorCycle = [undefined, 'green', 'blue', 'purple'];
        const currentColorIndex = colorCycle.indexOf(lastImage.color);
        const nextColor = colorCycle[(currentColorIndex + 1) % colorCycle.length];

        console.log(`🎨 Cycling color from ${lastImage.color || 'none'} to ${nextColor || 'none'}`);
        console.log(`📍 Color index: ${currentColorIndex} → ${(currentColorIndex + 1) % colorCycle.length}`);

        // Send update to extension
        if (window.vscode) {
            console.log('📤 Sending updateImageColor message to extension');
            window.vscode.postMessage({
                command: 'updateImageColor',
                data: {
                    imageId: lastImage.id,
                    color: nextColor,
                    cycleInfo: {
                        cycleIndex: (currentColorIndex + 1) % colorCycle.length,
                        colorName: ['None', 'Green', 'Blue', 'Purple'][(currentColorIndex + 1) % colorCycle.length]
                    }
                }
            });
        } else {
            console.error('❌ window.vscode not available');
        }
    }

    function updateImageColorDisplay(imageId, color) {
        const imageItem = document.querySelector(`[data-image-id="${imageId}"]`);
        if (!imageItem) {
            console.warn('Image item not found:', imageId);
            return;
        }

        // Remove existing color classes
        imageItem.classList.remove('color-green', 'color-blue', 'color-purple');
        
        // Add new color class if color is set
        if (color) {
            imageItem.classList.add(`color-${color}`);
        }
        
        // Update data attribute
        imageItem.setAttribute('data-color', color || '');

        // Update current note data
        if (currentNote && currentNote.images) {
            const image = currentNote.images.find(img => img.id === imageId);
            if (image) {
                if (color) {
                    image.color = color;
                } else {
                    delete image.color;
                }
            }
        }

        // Apply current filter
        applyColorFilter(currentColorFilter);
    }

    function setupColorFilters() {
        const filterButtons = document.querySelectorAll('.filter-btn');
        filterButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                const color = this.getAttribute('data-color');
                setActiveFilter(color);
                applyColorFilter(color);
            });
        });
    }

    function setupGalleryButton() {
        const galleryBtn = document.getElementById('openGalleryBtn');
        if (galleryBtn) {
            galleryBtn.addEventListener('click', function() {
                console.log('🖼️ Gallery button clicked');
                openImageGalleryInRightEditor();
            });
        }
    }

    function setActiveFilter(color) {
        currentColorFilter = color;
        
        // Update button states
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-color') === color);
        });
    }

    function applyColorFilter(color) {
        const imageItems = document.querySelectorAll('.image-item');
        
        imageItems.forEach(item => {
            const imageColor = item.getAttribute('data-color');
            const shouldShow = color === 'all' || imageColor === color;
            item.style.display = shouldShow ? 'block' : 'none';
        });
    }

    // Export functions for testing
    window.notesEditor = {
        saveNote,
        deleteNote,
        addImage,
        addTag,
        removeTag,
        markDirty
    };
})();
