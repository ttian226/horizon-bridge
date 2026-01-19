# Horizon Bridge

A Chrome extension that syncs Gemini web conversations to Obsidian with AI-powered knowledge graph (Canvas) generation.

**[中文文档](./README_CN.md)**

---

## ⚠️ Disclaimer (Read First)

**This is an experimental "personal use" project. Open-sourced for learning and reference only.**

1. **Maintenance**: This project comes with **NO guarantee** of long-term maintenance or updates. It's shared for developers who want to learn or build upon it.
2. **Breaking Risk**: This extension relies on parsing Gemini's web page DOM structure. **If Google updates the Gemini interface, the extension will break immediately.** You'll need to fix the selectors in `content.js` yourself ("Vibe Coding").
3. **Data Privacy**: This is a pure client-side extension. Your conversation data only flows between **your browser**, **Google Gemini API**, and **your local Obsidian**. It is **NOT** uploaded to any third-party server.

---

## Features

- **Conversation Archive**: Export Gemini web conversations to Obsidian Markdown files
- **AI Knowledge Graph**: Uses Gemini API to analyze conversations and generate Canvas mind maps
- **Smart Filtering**: Filters out chit-chat, extracts core knowledge points
- **Visual Enhancements**:
  - Hub & Spoke layout: Auto-identifies core concepts vs details
  - Semantic coloring: Auto-colors based on content type (problems/solutions/code/architecture)
  - Bidirectional links: Canvas cards link back to original Q&A files

## Prerequisites

1. **Google Chrome browser**
2. **Obsidian** (v1.0+)
3. **Gemini API Key** ([Get one here](https://aistudio.google.com/app/apikey))
   - *Why Gemini?* Gemini has a massive context window (1M+ tokens), ideal for analyzing long conversations
   - If you want to use OpenAI/Claude, you'll need to modify `utils/gemini-api.js`

### Required Obsidian Plugin

You only need **ONE** plugin:

| Plugin | Status | Purpose |
|--------|--------|---------|
| [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) | **Required** | Allows the extension to write files to your Obsidian Vault |

## Installation

### Step 1: Configure Obsidian Local REST API

1. Install and enable the **Local REST API** plugin in Obsidian
2. Go to plugin settings (Settings → Community plugins → Local REST API gear icon)
3. Enable **"Enable Non-encrypted (HTTP) Server"**
4. **Note down these values**:
   - **API Key**: Click the eye icon to reveal, then copy
   - **Port**: Default is `27123`
   - *Verify*: Visit `http://127.0.0.1:27123` in browser, you should see a response

### Step 2: Get Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create and copy your API Key

### Step 3: Install the Chrome Extension

1. **Download the code**:
   ```bash
   git clone https://github.com/ttian226/horizon-bridge.git
   # Or download the ZIP and extract
   ```

2. **Configure your keys**:
   - Copy `config.example.js` to `config.js`
   - Edit `config.js` with your keys:
   ```javascript
   export const CONFIG = {
     // Gemini API (for Canvas generation)
     geminiApiKey: 'YOUR_GEMINI_API_KEY',
     geminiModel: 'gemini-2.0-flash', // Recommended: fast and generous free tier

     // Obsidian config
     obsidianApiKey: 'YOUR_OBSIDIAN_PLUGIN_KEY',
     obsidianBaseUrl: 'http://127.0.0.1:27123',
     obsidianBasePath: 'Gemini' // Files saved to Vault/Gemini
   };
   ```

3. **Load the extension**:
   - Navigate to `chrome://extensions/`
   - Enable **"Developer mode"** (top right)
   - Click **"Load unpacked"** → Select this project folder

## Usage

1. Open any [Gemini web conversation](https://gemini.google.com/)

2. **⚠️ Critical Step: Load the Full Conversation**
   - For long conversations, Gemini only loads recent messages by default
   - **Manually scroll to the TOP of the page** until you see the first message, ensuring all content is loaded
   - *Skipping this step will result in incomplete documents and graphs*

3. Click the **Horizon Bridge** icon in your browser toolbar
4. Click **"Sync to Obsidian"**
5. Wait for sync to complete (long conversations may take 30+ seconds for AI graph generation)
6. Check results in Obsidian under `Gemini/` folder

## Output Structure

```
Gemini/
└── [Session Title]/
    ├── _INDEX.md           # Index page (summary and navigation)
    ├── Logic_Map.canvas    # AI-generated knowledge graph
    ├── 001-Question.md     # Individual Q&A files
    ├── 002-Answer.md
    └── ...
```

## FAQ

**Q: Why does the export only contain recent messages?**

Gemini uses "lazy loading" for long conversations. See Usage step 2 - you must manually scroll to the top of the page to load all history before syncing.

**Q: Sync button not working / errors?**

Press F12 to open Console and check red error messages:
- `401/403 Error`: Obsidian API Key is wrong, or Local REST API HTTP mode not enabled
- `DOM Error`: Google updated the page, you need to fix `content.js`

**Q: Why does Canvas only have a few nodes?**

Check console - Gemini API might be rate-limited, or the conversation is too short.

**Q: Can I use GPT-4 instead?**

Yes, but requires code changes. Modify `utils/gemini-api.js` and rewrite the `generate` method for OpenAI format. Note that GPT-4 has smaller context window and higher token costs.

## Modification Guide

If the extension breaks or you want to customize, modify these files:

| File | Purpose |
|------|---------|
| `content.js` | DOM parsing logic (fix this when Gemini updates) |
| `utils/gemini-api.js` | AI prompts and Canvas generation logic |
| `config.js` | API Keys and basic settings |

## Contributing

This project is primarily for **personal use** and may not actively handle Issues.

If the extension breaks:
1. **Recommended**: Fork this repo, fix it yourself, use via "Load unpacked"
2. **Optional**: If you fix it and want to share, Pull Requests are welcome

## License

MIT License
