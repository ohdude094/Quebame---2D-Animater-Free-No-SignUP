import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  TextContent,
  ImageContent,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { createCanvas, Canvas, CanvasRenderingContext2D } from "canvas";

// ═══════════════════════════════════════════════════════════════════════
// TYPES — mirror Quebame’s internal data structures
// ═══════════════════════════════════════════════════════════════════════
interface QuebameProject {
  id: string;
  name: string;
  canvasW: number;
  canvasH: number;
  bgColor: string;
  fps: number;
  layers: Layer[];
  activeLayerId: string;
  frames: Frame[];
  sound?: {
    audioBase64?: string | null;
    audioFileName?: string | null;
    audioMimeType?: string | null;
  };
  mouthDrawings?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
  frameCount: number;
  formatVersion: number;
  thumbnail?: string;
}

interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: string;
}

interface Frame {
  objects: Obj[];
  bgColor?: string | null;
  bgImage?: string | null;
  isMasterSymbol?: boolean;
  instanceOf?: string;
  symbolId?: string;
  _mouthId?: string;
}

interface Obj {
  id: string;
  type: "stroke" | "erase" | "shape" | "text" | "image" | "fill" | "group";
  name?: string;
  visible?: boolean;
  locked?: boolean;
  opacity?: number;
  layerId?: string;
  groupId?: string;
  // stroke / erase
  points?: { x: number; y: number; pressure?: number }[];
  color?: string;
  size?: number;
  // shape
  shape?: "rect" | "ellipse" | "line" | "triangle";
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  fillColor?: string;
  rotation?: number;
  // text
  text?: string;
  font?: string;
  bold?: boolean;
  italic?: boolean;
  // image
  src?: string;
  // fill
  fillX?: number;
  fillY?: number;
  tolerance?: number;
  gapPx?: number;
  smoothPx?: number;
  fillOpacity?: number;
  fillMode?: "flat" | "gradient";
  color2?: string;
  // rig
  rig?: RigData;
}

interface RigData {
  root: { x: number; y: number };
  nodes: { id: string; x: number; y: number; parentId: string }[];
  bindData?: any;
  groupIds?: string[];
  isKeyframe?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════
let currentProject: QuebameProject | null = null;
let currentProjectPath: string | null = null;

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ═══════════════════════════════════════════════════════════════════════
// PROJECT I/O
// ═══════════════════════════════════════════════════════════════════════
async function loadProject(filePath: string): Promise<QuebameProject> {
  const raw = await fs.readFile(filePath, "utf-8");
  const proj: QuebameProject = JSON.parse(raw);
  currentProject = proj;
  currentProjectPath = filePath;
  return proj;
}

async function saveProject(filePath?: string): Promise<void> {
  if (!currentProject) throw new Error("No project loaded");
  const target = filePath || currentProjectPath;
  if (!target) throw new Error("No path specified");
  currentProject.updatedAt = Date.now();
  currentProject.frameCount = currentProject.frames.length;
  await fs.writeFile(target, JSON.stringify(currentProject, null, 2), "utf-8");
  currentProjectPath = target;
}

// ═══════════════════════════════════════════════════════════════════════
// RENDER HELPERS (Node canvas for exports)
// ═══════════════════════════════════════════════════════════════════════
function drawObject(
  c: CanvasRenderingContext2D,
  obj: Obj,
  _frame?: Frame
) {
  c.save();
  c.globalAlpha = obj.opacity !== undefined ? obj.opacity : 1;

  if (obj.type === "stroke" || obj.type === "erase") {
    if (!obj.points || obj.points.length < 2) {
      if (obj.points && obj.points.length === 1) {
        c.beginPath();
        c.arc(obj.points[0].x, obj.points[0].y, (obj.size || 2) / 2, 0, Math.PI * 2);
        c.fillStyle = obj.color || "#fff";
        c.fill();
      }
    } else {
      c.beginPath();
      c.moveTo(obj.points[0].x, obj.points[0].y);
      for (let i = 1; i < obj.points.length; i++) {
        c.lineTo(obj.points[i].x, obj.points[i].y);
      }
      c.strokeStyle = obj.color || "#fff";
      c.lineWidth = obj.size || 2;
      c.lineCap = "round";
      c.lineJoin = "round";
      c.stroke();
    }
  } else if (obj.type === "shape" && obj.shape) {
    c.save();
    const cx = (obj.x || 0) + (obj.w || 0) / 2;
    const cy = (obj.y || 0) + (obj.h || 0) / 2;
    c.translate(cx, cy);
    c.rotate(((obj.rotation || 0) * Math.PI) / 180);
    c.translate(-(obj.w || 0) / 2, -(obj.h || 0) / 2);
    c.fillStyle = obj.fillColor || "transparent";
    c.strokeStyle = obj.color || "#fff";
    c.lineWidth = obj.size || 2;
    if (obj.shape === "rect") {
      c.fillRect(0, 0, obj.w || 0, obj.h || 0);
      c.strokeRect(0, 0, obj.w || 0, obj.h || 0);
    } else if (obj.shape === "ellipse") {
      c.beginPath();
      c.ellipse(
        (obj.w || 0) / 2,
        (obj.h || 0) / 2,
        Math.abs((obj.w || 0) / 2),
        Math.abs((obj.h || 0) / 2),
        0,
        0,
        Math.PI * 2
      );
      c.fill();
      c.stroke();
    } else if (obj.shape === "line") {
      c.beginPath();
      c.moveTo(0, (obj.h || 0) / 2);
      c.lineTo(obj.w || 0, (obj.h || 0) / 2);
      c.stroke();
    } else if (obj.shape === "triangle") {
      c.beginPath();
      c.moveTo((obj.w || 0) / 2, 0);
      c.lineTo(obj.w || 0, obj.h || 0);
      c.lineTo(0, obj.h || 0);
      c.closePath();
      c.fill();
      c.stroke();
    }
    c.restore();
  } else if (obj.type === "text" && obj.text) {
    c.font = `${obj.bold ? "bold " : ""}${obj.italic ? "italic " : ""}${
      obj.size || 24
    }px ${obj.font || "sans-serif"}`;
    c.fillStyle = obj.color || "#fff";
    c.fillText(obj.text, obj.x || 0, obj.y || 0);
  }
  c.restore();
}

function renderFrameToCanvas(
  frame: Frame,
  w: number,
  h: number,
  bgColor: string
): Canvas {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = frame.bgColor || bgColor;
  ctx.fillRect(0, 0, w, h);
  for (const obj of frame.objects) {
    if (obj.visible !== false) drawObject(ctx, obj, frame);
  }
  return canvas;
}

// ═══════════════════════════════════════════════════════════════════════
// ZOD SCHEMAS for tool arguments
// ═══════════════════════════════════════════════════════════════════════
const LoadProjectSchema = z.object({ path: z.string() });
const GetFrameSchema = z.object({ index: z.number().int().optional() });
const AddFrameSchema = z.object({
  afterIndex: z.number().int().optional(),
  inherit: z.boolean().optional().default(true),
});
const DeleteFrameSchema = z.object({ index: z.number().int() });
const AddLayerSchema = z.object({ name: z.string().optional() });
const AddShapeSchema = z.object({
  frameIndex: z.number().int().optional(),
  shape: z.enum(["rect", "ellipse", "line", "triangle"]),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  color: z.string().optional().default("#ffffff"),
  fillColor: z.string().optional().default("transparent"),
  size: z.number().optional().default(2),
  rotation: z.number().optional().default(0),
  layerId: z.string().optional(),
});
const AddTextSchema = z.object({
  frameIndex: z.number().int().optional(),
  text: z.string(),
  x: z.number(),
  y: z.number(),
  color: z.string().optional().default("#ffffff"),
  size: z.number().optional().default(24),
  layerId: z.string().optional(),
});
const AddStrokeSchema = z.object({
  frameIndex: z.number().int().optional(),
  points: z.array(z.object({ x: z.number(), y: z.number() })),
  color: z.string().optional().default("#ffffff"),
  size: z.number().optional().default(8),
  layerId: z.string().optional(),
});
const DeleteObjectSchema = z.object({
  frameIndex: z.number().int().optional(),
  objectId: z.string(),
});
const UpdateSettingsSchema = z.object({
  name: z.string().optional(),
  canvasW: z.number().int().optional(),
  canvasH: z.number().int().optional(),
  bgColor: z.string().optional(),
  fps: z.number().int().optional(),
});
const ExportFrameSchema = z.object({
  frameIndex: z.number().int().optional(),
  outPath: z.string(),
});
const ExportSequenceSchema = z.object({
  outDir: z.string(),
  prefix: z.string().optional().default("frame"),
});
const GenerateAIImageSchema = z.object({
  prompt: z.string(),
  width: z.number().int().optional().default(512),
  height: z.number().int().optional().default(512),
  model: z
    .string()
    .optional()
    .default("black-forest-labs/FLUX.1-schnell"),
  apiKey: z.string(),
  frameIndex: z.number().int().optional(),
  x: z.number().optional().default(0),
  y: z.number().optional().default(0),
});

// ═══════════════════════════════════════════════════════════════════════
// TOOL HANDLERS
// ═══════════════════════════════════════════════════════════════════════
const server = new Server(
  { name: "quebame-mcp-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "load_project",
        description:
          "Load a .quebame project file into memory so subsequent tools can operate on it.",
        inputSchema: {
          type: "object",
          properties: { path: { type: "string", description: "Absolute or relative path to the .quebame file" } },
          required: ["path"],
        },
      },
      {
        name: "get_project_info",
        description: "Get summary info about the currently loaded project.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "list_frames",
        description: "List all frames with object counts and optional mouth IDs.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "add_frame",
        description: "Append or insert a new frame. Optionally inherits content from the previous frame.",
        inputSchema: {
          type: "object",
          properties: {
            afterIndex: { type: "number", description: "Insert after this 0-based index. Omit to append at end." },
            inherit: { type: "boolean", description: "Copy objects from previous frame?" },
          },
        },
      },
      {
        name: "duplicate_frame",
        description: "Duplicate an existing frame.",
        inputSchema: {
          type: "object",
          properties: { index: { type: "number" } },
          required: ["index"],
        },
      },
      {
        name: "delete_frame",
        description: "Delete a frame by index.",
        inputSchema: {
          type: "object",
          properties: { index: { type: "number" } },
          required: ["index"],
        },
      },
      {
        name: "list_layers",
        description: "List all layers in the project.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "add_layer",
        description: "Add a new layer.",
        inputSchema: {
          type: "object",
          properties: { name: { type: "string" } },
        },
      },
      {
        name: "list_objects",
        description: "List objects in a frame (default: current frame 0).",
        inputSchema: {
          type: "object",
          properties: { frameIndex: { type: "number" } },
        },
      },
      {
        name: "add_shape",
        description: "Add a shape (rect, ellipse, line, triangle) to a frame.",
        inputSchema: {
          type: "object",
          properties: {
            frameIndex: { type: "number" },
            shape: { type: "string", enum: ["rect", "ellipse", "line", "triangle"] },
            x: { type: "number" },
            y: { type: "number" },
            w: { type: "number" },
            h: { type: "number" },
            color: { type: "string" },
            fillColor: { type: "string" },
            size: { type: "number" },
            rotation: { type: "number" },
            layerId: { type: "string" },
          },
          required: ["shape", "x", "y", "w", "h"],
        },
      },
      {
        name: "add_text",
        description: "Add text to a frame.",
        inputSchema: {
          type: "object",
          properties: {
            frameIndex: { type: "number" },
            text: { type: "string" },
            x: { type: "number" },
            y: { type: "number" },
            color: { type: "string" },
            size: { type: "number" },
            layerId: { type: "string" },
          },
          required: ["text", "x", "y"],
        },
      },
      {
        name: "add_stroke",
        description: "Add a pen stroke (freehand line) to a frame.",
        inputSchema: {
          type: "object",
          properties: {
            frameIndex: { type: "number" },
            points: { type: "array", items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } } } },
            color: { type: "string" },
            size: { type: "number" },
            layerId: { type: "string" },
          },
          required: ["points"],
        },
      },
      {
        name: "delete_object",
        description: "Delete an object by ID from a frame.",
        inputSchema: {
          type: "object",
          properties: {
            frameIndex: { type: "number" },
            objectId: { type: "string" },
          },
          required: ["objectId"],
        },
      },
      {
        name: "update_project_settings",
        description: "Update canvas size, background color, FPS, or project name.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            canvasW: { type: "number" },
            canvasH: { type: "number" },
            bgColor: { type: "string" },
            fps: { type: "number" },
          },
        },
      },
      {
        name: "export_frame_png",
        description: "Render a single frame to a PNG file (requires node-canvas).",
        inputSchema: {
          type: "object",
          properties: {
            frameIndex: { type: "number" },
            outPath: { type: "string" },
          },
          required: ["outPath"],
        },
      },
      {
        name: "export_sequence_png",
        description: "Render every frame as a numbered PNG sequence into a directory.",
        inputSchema: {
          type: "object",
          properties: {
            outDir: { type: "string" },
            prefix: { type: "string" },
          },
          required: ["outDir"],
        },
      },
      {
        name: "save_project",
        description: "Save the current project back to disk (overwrites original path unless newPath given).",
        inputSchema: {
          type: "object",
          properties: { newPath: { type: "string" } },
        },
      },
      {
        name: "generate_ai_image",
        description:
          "Generate an image via Hugging Face Inference API and insert it as an image object into a frame.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: { type: "string" },
            width: { type: "number" },
            height: { type: "number" },
            model: { type: "string" },
            apiKey: { type: "string", description: "Hugging Face API key (hf_…)" },
            frameIndex: { type: "number" },
            x: { type: "number" },
            y: { type: "number" },
          },
          required: ["prompt", "apiKey"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "load_project": {
        const { path: p } = LoadProjectSchema.parse(args);
        const proj = await loadProject(p);
        return {
          content: [
            {
              type: "text",
              text: `Loaded "${proj.name}" — ${proj.frames.length} frames, ${proj.layers.length} layers, ${proj.canvasW}×${proj.canvasH} @ ${proj.fps}fps.`,
            } as TextContent,
          ],
        };
      }

      case "get_project_info": {
        if (!currentProject) throw new Error("No project loaded. Use load_project first.");
        const p = currentProject;
        const totalObjects = p.frames.reduce((sum, f) => sum + f.objects.length, 0);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  name: p.name,
                  id: p.id,
                  canvas: `${p.canvasW}×${p.canvasH}`,
                  bgColor: p.bgColor,
                  fps: p.fps,
                  frames: p.frames.length,
                  layers: p.layers.length,
                  totalObjects,
                  updatedAt: new Date(p.updatedAt).toISOString(),
                },
                null,
                2
              ),
            } as TextContent,
          ],
        };
      }

      case "list_frames": {
        if (!currentProject) throw new Error("No project loaded.");
        const lines = currentProject.frames.map((f, i) => {
          const objCount = f.objects.length;
          const mouth = f._mouthId ? ` [mouth:${f._mouthId}]` : "";
          const sym = f.isMasterSymbol ? " ★symbol" : f.instanceOf ? " 🔗instance" : "";
          return `Frame ${i + 1}: ${objCount} objects${mouth}${sym}`;
        });
        return {
          content: [{ type: "text", text: lines.join("\n") } as TextContent],
        };
      }

      case "add_frame": {
        if (!currentProject) throw new Error("No project loaded.");
        const { afterIndex, inherit } = AddFrameSchema.parse(args);
        const idx = afterIndex !== undefined ? afterIndex + 1 : currentProject.frames.length;
        const prev = currentProject.frames[Math.max(0, idx - 1)];
        const newFrame: Frame = {
          objects: inherit !== false && prev ? JSON.parse(JSON.stringify(prev.objects)) : [],
          bgColor: prev ? prev.bgColor : currentProject.bgColor,
        };
        currentProject.frames.splice(idx, 0, newFrame);
        return {
          content: [
            { type: "text", text: `Added frame at index ${idx + 1} (now ${currentProject.frames.length} total).` } as TextContent,
          ],
        };
      }

      case "duplicate_frame": {
        if (!currentProject) throw new Error("No project loaded.");
        const { index } = DeleteFrameSchema.parse(args);
        if (index < 0 || index >= currentProject.frames.length) throw new Error("Invalid frame index.");
        const clone: Frame = JSON.parse(JSON.stringify(currentProject.frames[index]));
        currentProject.frames.splice(index + 1, 0, clone);
        return {
          content: [
            { type: "text", text: `Duplicated frame ${index + 1} → new frame ${index + 2}.` } as TextContent,
          ],
        };
      }

      case "delete_frame": {
        if (!currentProject) throw new Error("No project loaded.");
        const { index } = DeleteFrameSchema.parse(args);
        if (currentProject.frames.length <= 1) throw new Error("Cannot delete the only remaining frame.");
        if (index < 0 || index >= currentProject.frames.length) throw new Error("Invalid frame index.");
        currentProject.frames.splice(index, 1);
        return {
          content: [
            { type: "text", text: `Deleted frame ${index + 1}. ${currentProject.frames.length} frames remain.` } as TextContent,
          ],
        };
      }

      case "list_layers": {
        if (!currentProject) throw new Error("No project loaded.");
        const lines = currentProject.layers.map(
          (l) => `${l.id === currentProject!.activeLayerId ? "▸ " : "  "}${l.name} — opacity:${Math.round(l.opacity * 100)}% blend:${l.blendMode}${l.visible === false ? " (hidden)" : ""}${l.locked ? " (locked)" : ""}`
        );
        return {
          content: [{ type: "text", text: lines.join("\n") } as TextContent],
        };
      }

      case "add_layer": {
        if (!currentProject) throw new Error("No project loaded.");
        const { name } = AddLayerSchema.parse(args);
        const layer: Layer = {
          id: uid(),
          name: name || `Layer ${currentProject.layers.length + 1}`,
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: "normal",
        };
        currentProject.layers.push(layer);
        currentProject.activeLayerId = layer.id;
        return {
          content: [{ type: "text", text: `Added layer "${layer.name}" (${layer.id}).` } as TextContent],
        };
      }

      case "list_objects": {
        if (!currentProject) throw new Error("No project loaded.");
        const { frameIndex = 0 } = GetFrameSchema.parse(args);
        if (frameIndex < 0 || frameIndex >= currentProject.frames.length) throw new Error("Invalid frame index.");
        const frame = currentProject.frames[frameIndex];
        if (!frame.objects.length) {
          return { content: [{ type: "text", text: "No objects in this frame." } as TextContent] };
        }
        const lines = frame.objects.map((o, i) => {
          const layer = currentProject!.layers.find((l) => l.id === o.layerId);
          return `${i + 1}. [${o.type}] "${o.name || "untitled"}" id=${o.id}${layer ? ` layer=${layer.name}` : ""}${o.groupId ? ` group=${o.groupId.slice(0, 6)}` : ""}`;
        });
        return {
          content: [{ type: "text", text: lines.join("\n") } as TextContent],
        };
      }

      case "add_shape": {
        if (!currentProject) throw new Error("No project loaded.");
        const params = AddShapeSchema.parse(args);
        const frameIdx = params.frameIndex ?? 0;
        if (frameIdx < 0 || frameIdx >= currentProject.frames.length) throw new Error("Invalid frame index.");
        const obj: Obj = {
          id: uid(),
          type: "shape",
          shape: params.shape,
          x: params.x,
          y: params.y,
          w: params.w,
          h: params.h,
          color: params.color,
          fillColor: params.fillColor,
          size: params.size,
          rotation: params.rotation,
          visible: true,
          locked: false,
          opacity: 1,
          name: params.shape.charAt(0).toUpperCase() + params.shape.slice(1),
          layerId: params.layerId || currentProject.activeLayerId,
        };
        currentProject.frames[frameIdx].objects.push(obj);
        return {
          content: [
            { type: "text", text: `Added ${params.shape} to frame ${frameIdx + 1} (id=${obj.id}).` } as TextContent,
          ],
        };
      }

      case "add_text": {
        if (!currentProject) throw new Error("No project loaded.");
        const params = AddTextSchema.parse(args);
        const frameIdx = params.frameIndex ?? 0;
        const obj: Obj = {
          id: uid(),
          type: "text",
          text: params.text,
          x: params.x,
          y: params.y,
          color: params.color,
          size: params.size,
          font: "sans-serif",
          visible: true,
          locked: false,
          opacity: 1,
          name: "Text",
          layerId: params.layerId || currentProject.activeLayerId,
        };
        currentProject.frames[frameIdx].objects.push(obj);
        return {
          content: [
            { type: "text", text: `Added text "${params.text}" to frame ${frameIdx + 1} (id=${obj.id}).` } as TextContent,
          ],
        };
      }

      case "add_stroke": {
        if (!currentProject) throw new Error("No project loaded.");
        const params = AddStrokeSchema.parse(args);
        const frameIdx = params.frameIndex ?? 0;
        const obj: Obj = {
          id: uid(),
          type: "stroke",
          points: params.points,
          color: params.color,
          size: params.size,
          visible: true,
          locked: false,
          opacity: 1,
          name: "Stroke",
          layerId: params.layerId || currentProject.activeLayerId,
        };
        currentProject.frames[frameIdx].objects.push(obj);
        return {
          content: [
            { type: "text", text: `Added stroke with ${params.points.length} points to frame ${frameIdx + 1} (id=${obj.id}).` } as TextContent,
          ],
        };
      }

      case "delete_object": {
        if (!currentProject) throw new Error("No project loaded.");
        const params = DeleteObjectSchema.parse(args);
        const frameIdx = params.frameIndex ?? 0;
        const frame = currentProject.frames[frameIdx];
        const before = frame.objects.length;
        frame.objects = frame.objects.filter((o) => o.id !== params.objectId);
        const after = frame.objects.length;
        return {
          content: [
            { type: "text", text: `Deleted object ${params.objectId} from frame ${frameIdx + 1} (${before - after} removed).` } as TextContent,
          ],
        };
      }

      case "update_project_settings": {
        if (!currentProject) throw new Error("No project loaded.");
        const params = UpdateSettingsSchema.parse(args);
        if (params.name) currentProject.name = params.name;
        if (params.canvasW) currentProject.canvasW = params.canvasW;
        if (params.canvasH) currentProject.canvasH = params.canvasH;
        if (params.bgColor) currentProject.bgColor = params.bgColor;
        if (params.fps) currentProject.fps = params.fps;
        return {
          content: [
            {
              type: "text",
              text: `Updated project settings.\nCurrent: ${currentProject.name} — ${currentProject.canvasW}×${currentProject.canvasH}, ${currentProject.fps}fps, bg=${currentProject.bgColor}`,
            } as TextContent,
          ],
        };
      }

      case "export_frame_png": {
        if (!currentProject) throw new Error("No project loaded.");
        const params = ExportFrameSchema.parse(args);
        const idx = params.frameIndex ?? 0;
        if (idx < 0 || idx >= currentProject.frames.length) throw new Error("Invalid frame index.");
        const canvas = renderFrameToCanvas(
          currentProject.frames[idx],
          currentProject.canvasW,
          currentProject.canvasH,
          currentProject.bgColor
        );
        const buffer = canvas.toBuffer("image/png");
        await fs.mkdir(path.dirname(path.resolve(params.outPath)), { recursive: true });
        await fs.writeFile(params.outPath, buffer);
        return {
          content: [
            { type: "text", text: `Exported frame ${idx + 1} to ${params.outPath} (${buffer.length} bytes).` } as TextContent,
          ],
        };
      }

      case "export_sequence_png": {
        if (!currentProject) throw new Error("No project loaded.");
        const params = ExportSequenceSchema.parse(args);
        const dir = path.resolve(params.outDir);
        await fs.mkdir(dir, { recursive: true });
        for (let i = 0; i < currentProject.frames.length; i++) {
          const canvas = renderFrameToCanvas(
            currentProject.frames[i],
            currentProject.canvasW,
            currentProject.canvasH,
            currentProject.bgColor
          );
          const fileName = `${params.prefix}_${String(i + 1).padStart(4, "0")}.png`;
          await fs.writeFile(path.join(dir, fileName), canvas.toBuffer("image/png"));
        }
        return {
          content: [
            {
              type: "text",
              text: `Exported ${currentProject.frames.length} PNGs to ${dir}/`,
            } as TextContent,
          ],
        };
      }

      case "save_project": {
        if (!currentProject) throw new Error("No project loaded.");
        const newPath = (args as any).newPath as string | undefined;
        await saveProject(newPath);
        return {
          content: [
            { type: "text", text: `Project saved to ${currentProjectPath}.` } as TextContent,
          ],
        };
      }

      case "generate_ai_image": {
        if (!currentProject) throw new Error("No project loaded.");
        const params = GenerateAIImageSchema.parse(args);
        const isFlux = params.model.includes("FLUX");
        const body = isFlux
          ? { inputs: params.prompt }
          : {
              inputs: params.prompt,
              parameters: { width: params.width, height: params.height, num_inference_steps: 20 },
            };

        const res = await fetch(`https://api-inference.huggingface.co/models/${params.model}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${params.apiKey}`,
            "Content-Type": "application/json",
            "x-wait-for-model": "true",
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({} as any));
          throw new Error(err.error || `HF API error ${res.status}`);
        }

        const blob = await res.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const mime = blob.type || "image/png";
        const dataUrl = `data:${mime};base64,${base64}`;

        const frameIdx = params.frameIndex ?? 0;
        const obj: Obj = {
          id: uid(),
          type: "image",
          name: "AI Generated",
          x: params.x,
          y: params.y,
          w: params.width,
          h: params.height,
          rotation: 0,
          opacity: 1,
          visible: true,
          locked: false,
          src: dataUrl,
          layerId: currentProject.activeLayerId,
        };
        currentProject.frames[frameIdx].objects.push(obj);

        return {
          content: [
            { type: "text", text: `Generated AI image and inserted into frame ${frameIdx + 1} (id=${obj.id}).` } as TextContent,
            { type: "image", data: base64, mimeType: mime } as ImageContent,
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `Error: ${err.message || String(err)}` } as TextContent],
      isError: true,
    };
  }
});

// ═══════════════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════════════
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Quebame MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
