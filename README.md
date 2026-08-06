# Quebame 🎬

A browser-based animation studio — draw, rig, animate, lip-sync, and export right in your browser.

> **Live demo:** Open `index.html` in any modern browser. No build step needed for the app.

## What's in this repo

```
quebame/
├── index.html          ← The web app (single file, works offline)
├── mcp-server/         ← Model Context Protocol server for AI integration
│   ├── src/index.ts    ← Server source
│   ├── dist/           ← Compiled output (run `npm run build`)
│   └── package.json
├── .github/workflows/  ← CI that builds & tests the MCP server
└── claude-desktop-config.json  ← Example config for Claude Desktop
```

## Quick start — Web App

Just open `index.html`. That's it. Everything runs client-side.

## Quick start — MCP Server (for AI assistants)

The MCP server lets Claude, Cursor, and other AI tools read and edit your `.quebame` project files.

```bash
cd mcp-server
npm install
npm run build
npm start
```

### Connect to Claude Desktop

1. Copy the example config:
   ```bash
   # macOS
   cp claude-desktop-config.json ~/Library/Application\ Support/Claude/claude_desktop_config.json

   # Windows
   copy claude-desktop-config.json %APPDATA%\Claude\claude_desktop_config.json
   ```

2. Restart Claude Desktop.

3. Ask Claude: *"Load my animation.quebame project and add a red circle to frame 5."*

## MCP Capabilities

- **Read** project metadata, frames, layers, objects
- **Edit** timeline (add/duplicate/delete frames)
- **Draw** shapes, text, strokes programmatically
- **Export** PNG sequences and single frames
- **Generate** AI images via Hugging Face and insert them into frames

See [`mcp-server/README.md`](mcp-server/README.md) for full tool reference.

## GitHub Actions

The repo includes a CI workflow that:
- Installs MCP server dependencies
- Compiles TypeScript
- Verifies the server starts without errors

Every push and PR is checked automatically.
