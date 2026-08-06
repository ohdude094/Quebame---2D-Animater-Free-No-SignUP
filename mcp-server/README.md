# Quebame MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server for **Quebame**, the browser-based animation studio. Lets AI assistants (Claude, Cursor, etc.) read and manipulate `.quebame` project files programmatically.

## What it can do

| Tool | Description |
|------|-------------|
| `load_project` | Open a `.quebame` file |
| `get_project_info` | Show canvas size, fps, frame count, layers |
| `list_frames` | List every frame with object counts |
| `add_frame` / `duplicate_frame` / `delete_frame` | Timeline editing |
| `list_layers` / `add_layer` | Layer management |
| `list_objects` | List objects inside a frame |
| `add_shape` | Insert rect, ellipse, line, triangle |
| `add_text` | Insert text objects |
| `add_stroke` | Insert freehand pen strokes |
| `delete_object` | Remove an object by ID |
| `update_project_settings` | Resize canvas, change fps, rename, etc. |
| `export_frame_png` | Render one frame to PNG (via node-canvas) |
| `export_sequence_png` | Render every frame as a numbered PNG sequence |
| `save_project` | Write changes back to disk |
| `generate_ai_image` | Call Hugging Face and insert the result into a frame |

## Quick Start

```bash
cd quebame-mcp
npm install
npm run build
npm start
```

The server runs on **stdio** (standard MCP transport).

### Connect with Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "quebame": {
      "command": "node",
      "args": ["/absolute/path/to/quebame-mcp/dist/index.js"]
    }
  }
}
```

> **Note:** The server uses `node-canvas` for PNG export. If you hit native dependency issues, see [node-canvas install docs](https://github.com/Automattic/node-canvas#compiling).

## Example conversation

**You:** Load my project `animation.quebame`  
**Claude:** *Uses `load_project`* — Loaded "animation.quebame" — 24 frames, 3 layers, 800×600 @ 24fps.

**You:** Add a red circle in the center of frame 5  
**Claude:** *Uses `add_shape`* — Added ellipse to frame 5.

**You:** Export the whole timeline as PNGs to `./exports`  
**Claude:** *Uses `export_sequence_png`* — Exported 24 PNGs to ./exports/

## Project file format

`.quebame` files are JSON. The server understands the exact schema used by the web app (frames, layers, objects, rig data, mouth drawings, etc.).

## Browser Bridge (optional)

If you want the **live web app** to receive MCP commands directly (instead of file-based), see `bridge/`. It adds a small WebSocket relay so the MCP server can push changes into the open browser tab in real time.
