# Horizon Bridge

A Chrome extension that syncs Gemini conversations to Obsidian with AI-powered knowledge graph generation.

**[中文文档](./README_CN.md)**

## Features

- **One-click Sync**: Export Gemini conversations to Obsidian as Markdown files
- **AI Knowledge Graph**: Auto-generate Canvas mind maps with thematic clustering
- **Smart Compression**: 4-tier adaptive strategy for handling large conversations (15/50/120+ QAs)
- **Visual Aesthetics**: Semantic coloring, variable card sizes (S/M/L), Hub & Spoke layout
- **Clickable Links**: Each card links back to original Q&A files

## Prerequisites

- Google Chrome browser
- [Obsidian](https://obsidian.md/) (v1.0+)
- [Obsidian Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) plugin
- [Gemini API Key](https://aistudio.google.com/app/apikey) (free tier available)

## Installation

### Step 1: Configure Obsidian Local REST API

1. Open Obsidian → Settings → Community plugins
2. Browse and install **"Local REST API"**
3. Enable the plugin
4. In plugin settings:
   - Enable **"Enable Non-encrypted (HTTP) Server"**
   - Note down your **API Key** (you'll need this later)
   - Default URL: `http://127.0.0.1:27123`

### Step 2: Get Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click "Create API Key"
3. Copy and save your API key

### Step 3: Install the Extension

1. Download or clone this repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/horizon-bridge.git
   ```

2. Create your config file:
   ```bash
   cp config.example.js config.js
   ```

3. Edit `config.js` with your API keys:
   ```javascript
   export const CONFIG = {
     // Gemini API
     geminiApiKey: 'YOUR_GEMINI_API_KEY',      // From Step 2
     geminiModel: 'gemini-2.0-flash-lite',     // Recommended model

     // Obsidian Local REST API
     obsidianApiKey: 'YOUR_OBSIDIAN_API_KEY',  // From Step 1
     obsidianBaseUrl: 'http://127.0.0.1:27123', // Default port
     obsidianBasePath: 'Gemini'                 // Folder in your vault
   };
   ```

4. Load the extension in Chrome:
   - Navigate to `chrome://extensions/`
   - Enable **"Developer mode"** (top right toggle)
   - Click **"Load unpacked"**
   - Select the `horizon-bridge` folder

5. Pin the extension to your toolbar for easy access

## Usage

1. Open any [Gemini conversation](https://gemini.google.com/) in Chrome
2. Click the **Horizon Bridge** extension icon
3. Click **"Sync to Obsidian"**
4. Wait for the sync to complete
5. Find your files in Obsidian at `Vault/Gemini/[Session Name]/`

## Output Structure

```
Gemini/
└── [Session Name]/
    ├── _INDEX.md           # Overview with summary and embedded links
    ├── Logic_Map.canvas    # AI-generated knowledge graph
    ├── 001-Topic_A.md      # Individual Q&A file
    ├── 002-Topic_B.md      # Individual Q&A file
    └── ...
```

### Canvas Features

- **Hub & Spoke Layout**: Core concepts as hubs, details as satellites
- **Semantic Colors**:
  - Purple (6): Core architecture, main concepts
  - Green (4): Solutions, best practices
  - Red (1): Problems, warnings
  - Yellow (3): Tools, resources
  - Cyan (5): Examples, code
  - Grey (0): Background info
- **Variable Sizes**: L (large) for hubs, M/S for details
- **Clickable Links**: Jump to original Q&A from any card

## Troubleshooting

### "Failed to connect to Obsidian"
- Make sure Obsidian is running
- Check that Local REST API plugin is enabled
- Verify the port (default: 27123) matches your config

### "Gemini API error"
- Verify your Gemini API key is correct
- Check your API quota at [Google AI Studio](https://aistudio.google.com/)

### Links not clickable in Canvas
- Make sure you're using v18 or later
- Re-sync the conversation to regenerate the canvas

## Version History

| Version | Features |
|---------|----------|
| v18 | Compact footer with clickable Wiki-Links |
| v17 | Variable sizes (S/M/L) + semantic coloring |
| v16 | Visual de-escalation, gray connection lines |
| v15 | Rainbow Hub theme, Gateway Protocol |

## License

MIT

## Contributing

Issues and Pull Requests are welcome!
