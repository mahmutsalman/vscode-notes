# Notes - Visual Note-Taking Extension for VS Code

A powerful VS Code extension that provides integrated note-taking with visual screenshot support, allowing developers to capture, organize, and search through notes without leaving their IDE.

## Features

### Core Functionality

- **📝 Text Notes**: Create rich text notes with full markdown support
- **📷 Visual Notes**: Paste screenshots from clipboard or add images
- **🏷️ Tag System**: Organize notes with multiple tags and autocomplete
- **🔍 Powerful Search**: Full-text search with tag filtering and fuzzy matching
- **🔗 Code Linking**: Link notes to specific files and line numbers
- **📌 Pinned Notes**: Pin important notes for quick access

### VS Code Integration

- **Activity Bar**: Custom Notes panel in VS Code sidebar
- **Tree View**: Organized view of all notes with visual indicators
- **Webview Editor**: Rich editing interface with image gallery
- **Command Palette**: Access all features via Command Palette
- **Keyboard Shortcuts**: Quick actions with customizable shortcuts

### Storage & Organization

- **Local Storage**: All data stored locally in `.notes/` folder
- **JSON Format**: Human-readable storage format
- **Image Management**: Automatic thumbnail generation
- **Index System**: Fast search and retrieval
- **Backup Friendly**: Easy to backup and sync across devices

## Installation

### From Source

1. Clone this repository
2. Open in VS Code
3. Run `npm install` to install dependencies
4. Press `F5` to run the extension in a new Extension Development Host window

### Building VSIX Package

```bash
npm install -g vsce
npm run compile
vsce package
```

## Usage

### Creating Notes

1. **New Note**: Click the `+` button in the Notes panel or use `Ctrl+Alt+N`
2. **Add Content**: Write your note content in the text editor
3. **Add Tags**: Type tags in the tags input field (press Enter to add)
4. **Add Images**: Click "Add Image" button or paste from clipboard (`Ctrl+Alt+V`)
5. **Save**: Use `Ctrl+S` or click the Save button

### Organizing Notes

- **Pin Notes**: Check the "📌 Pinned" checkbox to pin important notes
- **Use Tags**: Add descriptive tags to categorize notes
- **Link to Code**: Right-click in any file and select "Link to Current Code"

### Searching Notes

1. **Quick Search**: Use `Ctrl+Alt+F` to open the search dialog
2. **Tag Filtering**: Click on tags in the Recent Tags section
3. **Advanced Search**: Filter by type, date range, or pinned status

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Alt+N` | Create new note |
| `Ctrl+Alt+V` | Paste image from clipboard |
| `Ctrl+Alt+F` | Search notes |
| `Ctrl+Alt+L` | Link to current code |
| `Ctrl+S` | Save note (in editor) |

## File Structure

```
.notes/
├── notes/
│   ├── note-{timestamp}-{id}.json    # Note metadata
│   └── note-{timestamp}-{id}.json
├── images/
│   ├── {note-id}/
│   │   ├── image-{timestamp}.png     # Original images
│   │   └── thumb-{timestamp}.png     # Thumbnails
├── config.json                      # Extension settings
└── index.json                       # Note index for fast search
```

## Data Format

Notes are stored in JSON format with the following structure:

```json
{
  "$schema": "https://schemas.notes.com/note-schema",
  "id": "note-1756649127992-abc123",
  "title": "Bug in login form",
  "content": "User authentication fails when...",
  "tags": ["bug", "authentication", "frontend"],
  "created": 1756649127992,
  "updated": 1756920664090,
  "images": [
    {
      "id": "1756920664119-jwogtzav3",
      "filename": "clipboard-image-1756920664090.png",
      "path": ".notes/images/note-1756649127992-abc123/clipboard-image-1756920664090.png",
      "thumbnail": ".notes/images/note-1756649127992-abc123/thumb-clipboard-image-1756920664090.png",
      "size": 95454,
      "dimensions": { "width": 1920, "height": 1080 },
      "created": 1756920664119,
      "caption": "Error message screenshot"
    }
  ],
  "linkedFiles": [
    {
      "path": "src/components/LoginForm.tsx",
      "line": 42,
      "description": "Where the error occurs"
    }
  ]
}
```

## Configuration

The extension creates a `config.json` file in the `.notes/` directory with the following default settings:

```json
{
  "version": "1.0.0",
  "settings": {
    "autoSave": true,
    "thumbnailSize": 200,
    "maxImageSize": 5242880
  }
}
```

## Development

### Project Structure

```
src/
├── extension.ts              # Main extension entry point
├── providers/
│   ├── NotesProvider.ts      # Tree data provider for sidebar
│   └── WebviewProvider.ts    # Note editor webview
├── services/
│   ├── StorageService.ts     # File system operations
│   ├── ImageService.ts       # Image processing & thumbnails
│   └── SearchService.ts      # Search & indexing
├── models/
│   ├── Note.ts              # Note data model
│   └── NoteIndex.ts         # Search index model
└── webview/
    ├── noteEditor.js        # Webview logic
    └── styles.css           # UI styling
```

### Building

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode for development
npm run watch

# Lint code
npm run lint

# Package extension
vsce package
```

### Dependencies

- **fuse.js**: Fuzzy search functionality
- **sharp**: Image processing and thumbnail generation (optional)

## Performance

The extension is designed for optimal performance:

- **Fast Startup**: < 300ms extension activation time
- **Quick Operations**: < 500ms for note creation
- **Efficient Search**: < 200ms search results for up to 1000 notes
- **Image Handling**: < 1s for pasting images up to 5MB

## Privacy & Security

- **Local Storage**: All data stored locally, no cloud services
- **No Telemetry**: Extension doesn't collect or send any data
- **Workspace Security**: Respects VS Code workspace permissions
- **Image Privacy**: No external image processing services

## Troubleshooting

### Common Issues

1. **Extension not activating**: Ensure you have a workspace open
2. **Images not saving**: Check write permissions in workspace folder
3. **Search not working**: Try refreshing the notes panel
4. **Performance issues**: Check if `.notes/` folder is excluded from file watchers

### Debug Mode

Enable debug logging by setting the VS Code log level:

```json
{
  "developer.logLevel": "debug"
}
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Roadmap

### Upcoming Features

- **Cloud Sync**: Synchronize notes across devices
- **Collaboration**: Share notes with team members
- **Export Options**: Export to Markdown, PDF, HTML
- **Voice Notes**: Audio recording support
- **Templates**: Pre-defined note templates
- **Integration**: Connect with issue trackers (Jira, GitHub)

### Version History

- **v1.0.0**: Initial release with core functionality
  - Text and visual note-taking
  - Tag system and search
  - Code linking
  - Local storage

---

**Made with ❤️ for developers by developers**