# Horizon Bridge

A Chrome extension that syncs Gemini conversations to Obsidian with AI-powered knowledge graph generation.

## Features

- **One-click sync**: Export Gemini conversations to Obsidian as Markdown files
- **AI Knowledge Graph**: Auto-generate Canvas mind maps with thematic clustering
- **Smart Compression**: 4-tier adaptive strategy for handling large conversations
- **Visual Aesthetics**: Semantic coloring, variable card sizes, Hub & Spoke layout

## Prerequisites

- [Obsidian](https://obsidian.md/) with [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) plugin
- [Gemini API Key](https://aistudio.google.com/app/apikey)

## Installation

1. Clone this repository
2. Copy `config.example.js` to `config.js`
3. Fill in your API keys in `config.js`:
   ```javascript
   export const CONFIG = {
     geminiApiKey: 'YOUR_GEMINI_API_KEY',
     geminiModel: 'gemini-2.0-flash-lite',
     obsidianApiKey: 'YOUR_OBSIDIAN_API_KEY',
     obsidianBaseUrl: 'http://127.0.0.1:27123',
     obsidianBasePath: 'Gemini'
   };
   ```
4. Load the extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the project folder

## Usage

1. Open a Gemini conversation in Chrome
2. Click the Horizon Bridge extension icon
3. Click "Sync to Obsidian"
4. Find your synced files in `Obsidian Vault/Gemini/[Session Name]/`

## Output Structure

```
Gemini/
└── [Session Name]/
    ├── _INDEX.md           # Overview with embedded links
    ├── Logic_Map.canvas    # AI-generated knowledge graph
    ├── 001-Topic_A.md      # Individual Q&A files
    ├── 002-Topic_B.md
    └── ...
```

## Version History

- **v18**: Compact footer with clickable Wiki-Links
- **v17**: Variable sizes (S/M/L) + semantic coloring
- **v16**: Visual de-escalation, Gateway Protocol
- **v15**: Rainbow Hub theme, strict Hub-to-Hub routing

## License

MIT
