// bridge-server.js
// A tiny WebSocket relay that sits between the MCP server and the browser.
// Run: node bridge-server.js

import { WebSocketServer } from "ws";
import { createServer } from "http";
import { execa } from "execa";

const HTTP_PORT = 3456;
const WS_PORT = 3457;

// Serve the bridge client script
const httpServer = createServer((req, res) => {
  if (req.url === "/quebame-bridge.js") {
    res.writeHead(200, { "Content-Type": "application/javascript" });
    res.end(BRIDGE_CLIENT_CODE);
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});
httpServer.listen(HTTP_PORT, () => {
  console.log(`Bridge client available at http://localhost:${HTTP_PORT}/quebame-bridge.js`);
});

// WebSocket relay
const wss = new WebSocketServer({ port: WS_PORT });
let mcpProcess = null;

wss.on("connection", (ws) => {
  console.log("Browser connected to bridge.");

  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "mcp_call") {
        // Forward to MCP server via stdio
        if (!mcpProcess) {
          mcpProcess = execa("node", ["../dist/index.js"], { stdio: ["pipe", "pipe", "inherit"] });
          mcpProcess.stdout.on("data", (data) => {
            const lines = data.toString().trim().split("\n");
            for (const line of lines) {
              try {
                const response = JSON.parse(line);
                ws.send(JSON.stringify({ type: "mcp_response", id: msg.id, payload: response }));
              } catch {
                ws.send(JSON.stringify({ type: "mcp_log", text: line }));
              }
            }
          });
        }
        mcpProcess.stdin.write(JSON.stringify(msg.payload) + "\n");
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: "error", text: e.message }));
    }
  });

  ws.on("close", () => {
    console.log("Browser disconnected.");
    if (mcpProcess) { mcpProcess.kill(); mcpProcess = null; }
  });
});

console.log(`WebSocket bridge running on ws://localhost:${WS_PORT}`);

const BRIDGE_CLIENT_CODE = `
// Quebame Browser Bridge — drop this into your HTML:
// <script src="http://localhost:3456/quebame-bridge.js"><\/script>
(function() {
  const ws = new WebSocket('ws://localhost:3457');
  ws.onopen = () => console.log('[Quebame Bridge] Connected');
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'mcp_response') {
      window.dispatchEvent(new CustomEvent('quebame-mcp-response', { detail: msg }));
    }
  };
  window.quebameMCP = {
    call: (tool, args) => {
      const id = Math.random().toString(36).slice(2);
      return new Promise((resolve) => {
        const handler = (e) => { if (e.detail.id === id) { resolve(e.detail.payload); window.removeEventListener('quebame-mcp-response', handler); } };
        window.addEventListener('quebame-mcp-response', handler);
        ws.send(JSON.stringify({ type: 'mcp_call', id, payload: { method: 'tools/call', params: { name: tool, arguments: args } } }));
      });
    }
  };
})();
`;
