# TechnoTez SVG Icons

- All icons are 24×24, stroke-based, and inherit the current text color via `stroke="currentColor"`.
- Great for VS Code themes: the icons will automatically adapt to foreground color.
- Recommended: for Activity Bar, keep it monochrome.

## Usage in VS Code (Activity Bar)
In `package.json`:
```json
{
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        { "id": "technotez", "title": "TechnoTez", "icon": "media/icons/activity-bar-icon.svg" }
      ]
    }
  }
}
```

## In Webview
```html
<img src="media/icons/note-text.svg" width="20" height="20" alt="Text note" />
```

All files are in this folder.
