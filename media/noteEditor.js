(function() {
    'use strict';

    // Global state
    let currentNote = null;
    let isDirty = false;
    let autoSaveTimeout = null;

    // Initialize when DOM is loaded
    document.addEventListener('DOMContentLoaded', function() {
        initializeEditor();
        setupEventListeners();
        setupAutoSave();
        
        // Load initial note data
        if (typeof window.noteData !== 'undefined' && window.noteData) {
            console.log('📄 Loading note data:', window.noteData);
            loadNoteData(window.noteData);
        } else {
            console.warn('⚠️ No note data available');
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
            const contentEditor = document.getElementById('contentEditor');
            const pinnedCheckbox = document.getElementById('pinnedCheckbox');
            
            if (titleInput) {
                titleInput.addEventListener('input', markDirty);
                console.log('✅ Title input listener added');
            }
            
            if (contentEditor) {
                contentEditor.addEventListener('input', markDirty);
                console.log('✅ Content editor listener added');
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
            if (e.target.classList.contains('remove-image')) {
                removeImage(e.target.dataset.imageId);
            } else if (e.target.classList.contains('thumbnail')) {
                viewFullImage(e.target);
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
        
        // Populate form fields
        document.getElementById('noteTitle').value = data.title || '';
        document.getElementById('contentEditor').value = data.content || '';
        document.getElementById('pinnedCheckbox').checked = !!data.isPinned;
        
        // Load tags
        loadTags(data.tags || []);
        
        // Load images
        loadImages(data.images || []);
        
        // Load linked files
        loadLinkedFiles(data.linkedFiles || []);
        
        // Reset dirty state
        isDirty = false;
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
            <h3>Images (${images.length})</h3>
            <div class="images-grid">
                ${images.map(img => `
                    <div class="image-item" data-image-id="${img.id}">
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
                content: document.getElementById('contentEditor').value,
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
        if (confirm('Remove this image from the note?')) {
            if (window.vscode) {
                window.vscode.postMessage({
                    command: 'removeImage',
                    data: { imageId }
                });
            }
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
                        <button class="image-modal-close" id="closeModal" aria-label="Close">✕</button>
                    </div>
                    <div class="image-modal-body">
                        <button class="image-modal-nav image-modal-prev" id="prevImage" aria-label="Previous image">‹</button>
                        <div class="image-modal-content">
                            <img id="modalImage" class="image-modal-image" alt="Full size image" />
                            <div class="image-modal-loading" id="imageLoading">Loading...</div>
                        </div>
                        <button class="image-modal-nav image-modal-next" id="nextImage" aria-label="Next image">›</button>
                    </div>
                    <div class="image-modal-footer">
                        <div class="image-modal-info">
                            <span id="imageFilename"></span>
                            <span id="imageDimensions"></span>
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
            
            // Click outside to close
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) {
                    this.close();
                }
            });
            
            // Keyboard navigation
            this.keyboardHandler = (e) => this.handleKeyboard(e);
            document.addEventListener('keydown', this.keyboardHandler);
            
            // Image load events
            this.currentImage.onload = () => this.hideLoading();
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
            }
        }
        
        navigate(direction) {
            if (this.images.length <= 1) return;
            
            const newIndex = (this.currentIndex + direction + this.images.length) % this.images.length;
            console.log(`🔄 Navigating: ${this.currentIndex} → ${newIndex}`);
            
            this.currentIndex = newIndex;
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
        
        close() {
            console.log('🔄 Closing image modal');
            
            // Remove event listeners
            if (this.keyboardHandler) {
                document.removeEventListener('keydown', this.keyboardHandler);
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
            case 'saveSuccess':
                isDirty = false;
                updateSaveButtonState();
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