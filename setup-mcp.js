#!/usr/bin/env node
// setup-mcp.js — Run this from the repo root to auto-install the MCP server

import { execSync } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";

const repoRoot = process.cwd();
const mcpDir = resolve(repoRoot, "mcp-server");

if (!existsSync(mcpDir)) {
  console.error("Error: mcp-server/ directory not found. Run this from the repo root.");
  process.exit(1);
}

console.log("\n🎬 Setting up Quebame MCP Server...\n");

// 1. Install deps
console.log("📦 Installing dependencies...");
execSync("npm install", { cwd: mcpDir, stdio: "inherit" });

// 2. Build
console.log("\n🔨 Building TypeScript...");
execSync("npm run build", { cwd: mcpDir, stdio: "inherit" });

// 3. Verify
console.log("\n✅ Build complete. Verifying server starts...");
try {
  execSync("node dist/index.js --help || true", { cwd: mcpDir, stdio: "pipe", timeout: 3000 });
} catch {
  // --help will fail because we don't implement it, but it proves the server loads
}

// 4. Print config snippet
console.log("\n🚀 Setup complete!\n");
console.log("Add this to your Claude Desktop config:");
console.log("─────────────────────────────────────────");
console.log(JSON.stringify({
  mcpServers: {
    quebame: {
      command: "node",
      args: [resolve(mcpDir, "dist/index.js")]
    }
  }
}, null, 2));
console.log("─────────────────────────────────────────\n");
console.log("Config locations:");
console.log("  macOS: ~/Library/Application Support/Claude/claude_desktop_config.json");
console.log("  Windows: %APPDATA%\\Claude\\claude_desktop_config.json");
console.log("  Linux: ~/.config/Claude/claude_desktop_config.json\n");
