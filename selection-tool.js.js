/**
 * selection-tool.js
 * A smooth rectangular selection tool for frame-by-frame animators.
 * No twin/duplicate bug. Provides: select, move, delete, marching ants.
 * 
 * How to use in your existing animator:
 * 
 * 1. Make sure you have a canvas with id "mainCanvas" and an overlay canvas with id "selectionCanvas"
 *    (or pass any canvas element).
 * 
 * 2. In your main animator code, after initializing your canvas, create an instance:
 * 
 *    const selection = new SelectionTool({
 *        canvas: document.getElementById('mainCanvas'),
 *        ctx: mainCanvas.getContext('2d'),
 *        selectionCanvas: document.getElementById('selectionCanvas'),
 *        // The following functions must be provided by your app:
 *        saveFrameData: () => { /* your code to save current frame data */ },
 *        updateThumbnail: () => { /* your code to refresh timeline thumbnail */ },
 *        saveState: () => { /* your undo stack push */ }
 *    });
 * 
 * 3. In your tool switching logic, when you activate the selection tool, call:
 *    selection.activate();
 *    When you deactivate it (switch to pencil/eraser/etc.), call:
 *    selection.deactivate();
 * 
 * 4. When you load a new frame, call:
 *    selection.onFrameChange();
 * 
 * 5. To delete the selected content (e.g., on Delete key), call:
 *    selection.delete();
 */

class SelectionTool {
    constructor(options) {
        // Required dependencies
        this.canvas = options.canvas;
        this.ctx = options.ctx;
        this.selectionCanvas = options.selectionCanvas;
        this.saveFrameData = options.saveFrameData;
        this.updateThumbnail = options.updateThumbnail;
        this.saveState = options.saveState;

        // Dimensions (set once, but you can also read from canvas dynamically)
        this.width = this.canvas.width;
        this.height = this.canvas.height;

        // State
        this.rect = null;           // {x, y, w, h}
        this.data = null;           // ImageData of selected area
        this.isSelecting = false;
        this.selectionStart = null;
        this.isMoving = false;
        this.moveStart = null;
        this.moveOriginalRect = null;
        this.moveOriginalData = null;

        // Active flag (tool enabled)
        this.active = false;

        // Bind event handlers
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
    }

    // Call this when the selection tool becomes active
    activate() {
        if (this.active) return;
        this.active = true;
        this.canvas.addEventListener('mousedown', this.onMouseDown);
        window.addEventListener('mousemove', this.onMouseMove);
        window.addEventListener('mouseup', this.onMouseUp);
        this.canvas.style.cursor = 'crosshair';
    }

    // Call this when switching to another tool
    deactivate() {
        if (!this.active) return;
        this.active = false;
        this.clear();
        this.canvas.removeEventListener('mousedown', this.onMouseDown);
        window.removeEventListener('mousemove', this.onMouseMove);
        window.removeEventListener('mouseup', this.onMouseUp);
        this.canvas.style.cursor = 'default';
    }

    // Clear current selection (call when loading a new frame or manually)
    clear() {
        this.rect = null;
        this.data = null;
        this.isSelecting = false;
        this.isMoving = false;
        this.selectionStart = null;
        this.moveStart = null;
        this.clearOverlay();
    }

    // Delete selected content (can be called from keyboard handler)
    delete() {
        if (!this.rect || !this.active) return;
        this.saveState();               // push to undo stack
        this.ctx.clearRect(this.rect.x, this.rect.y, this.rect.w, this.rect.h);
        this.saveFrameData();
        this.updateThumbnail();
        this.clear();
    }

    // Call this whenever you load a different frame
    onFrameChange() {
        this.clear();
    }

    // ---------- Internal methods ----------
    clearOverlay() {
        const ctx = this.selectionCanvas.getContext('2d');
        ctx.clearRect(0, 0, this.selectionCanvas.width, this.selectionCanvas.height);
    }

    drawMarchingAnts() {
        if (!this.rect) {
            this.clearOverlay();
            return;
        }
        const { x, y, w, h } = this.rect;
        const phase = (Date.now() / 100) % 20;
        const ctx = this.selectionCanvas.getContext('2d');
        ctx.clearRect(0, 0, this.selectionCanvas.width, this.selectionCanvas.height);
        ctx.save();

        // black dash
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(x, y, w, h);

        // white dash offset
        ctx.strokeStyle = '#fff';
        ctx.setLineDash([5, 5]);
        ctx.translate(phase, 0);
        ctx.strokeRect(x, y, w, h);

        ctx.restore();
        requestAnimationFrame(() => this.drawMarchingAnts());
    }

    createSelection(x, y, w, h) {
        // clamp to canvas bounds
        let sx = Math.max(0, Math.min(x, this.width));
        let sy = Math.max(0, Math.min(y, this.height));
        let sw = Math.min(w, this.width - sx);
        let sh = Math.min(h, this.height - sy);
        if (sw <= 0 || sh <= 0) return;
        this.rect = { x: sx, y: sy, w: sw, h: sh };
        this.data = this.ctx.getImageData(sx, sy, sw, sh);
        this.drawMarchingAnts();
    }

    applyMove(deltaX, deltaY) {
        if (!this.rect || !this.data) return;
        this.saveState();
        const { x, y, w, h } = this.rect;
        let newX = x + deltaX;
        let newY = y + deltaY;
        newX = Math.max(0, Math.min(newX, this.width - w));
        newY = Math.max(0, Math.min(newY, this.height - h));
        if (newX === x && newY === y) return;

        // clear old content
        this.ctx.clearRect(x, y, w, h);
        // paste at new location
        this.ctx.putImageData(this.data, newX, newY);

        // update stored selection
        this.rect = { x: newX, y: newY, w, h };
        this.data = this.ctx.getImageData(newX, newY, w, h);

        this.saveFrameData();
        this.updateThumbnail();
        this.drawMarchingAnts();
    }

    // ---------- Event handlers ----------
    onMouseDown(e) {
        if (!this.active) return;
        const pos = this.getMousePos(e);
        // if click inside existing selection -> start moving
        if (this.rect && pos.x >= this.rect.x && pos.x <= this.rect.x + this.rect.w &&
            pos.y >= this.rect.y && pos.y <= this.rect.y + this.rect.h) {
            this.isMoving = true;
            this.moveStart = { x: pos.x, y: pos.y };
            this.moveOriginalRect = { ...this.rect };
            this.moveOriginalData = this.data;

            // draw ghost on overlay
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.moveOriginalData.width;
            tempCanvas.height = this.moveOriginalData.height;
            tempCanvas.getContext('2d').putImageData(this.moveOriginalData, 0, 0);
            const overlayCtx = this.selectionCanvas.getContext('2d');
            overlayCtx.clearRect(0, 0, this.selectionCanvas.width, this.selectionCanvas.height);
            overlayCtx.globalAlpha = 0.6;
            overlayCtx.drawImage(tempCanvas, this.moveOriginalRect.x, this.moveOriginalRect.y);
            overlayCtx.globalAlpha = 1.0;
            return;
        }
        // start new selection
        this.clear();
        this.isSelecting = true;
        this.selectionStart = { x: pos.x, y: pos.y };
    }

    onMouseMove(e) {
        if (!this.active) return;
        const pos = this.getMousePos(e);
        if (this.isSelecting && this.selectionStart) {
            // draw preview rectangle
            const overlayCtx = this.selectionCanvas.getContext('2d');
            overlayCtx.clearRect(0, 0, this.selectionCanvas.width, this.selectionCanvas.height);
            overlayCtx.save();
            overlayCtx.strokeStyle = '#3b82f6';
            overlayCtx.lineWidth = 1;
            overlayCtx.setLineDash([5, 5]);
            overlayCtx.strokeRect(this.selectionStart.x, this.selectionStart.y,
                                  pos.x - this.selectionStart.x, pos.y - this.selectionStart.y);
            overlayCtx.restore();
            this.lastMovePos = pos;
        } else if (this.isMoving && this.moveStart) {
            const deltaX = pos.x - this.moveStart.x;
            const deltaY = pos.y - this.moveStart.y;
            let newX = this.moveOriginalRect.x + deltaX;
            let newY = this.moveOriginalRect.y + deltaY;
            newX = Math.max(0, Math.min(newX, this.width - this.moveOriginalRect.w));
            newY = Math.max(0, Math.min(newY, this.height - this.moveOriginalRect.h));

            // update ghost position
            const overlayCtx = this.selectionCanvas.getContext('2d');
            overlayCtx.clearRect(0, 0, this.selectionCanvas.width, this.selectionCanvas.height);
            overlayCtx.globalAlpha = 0.6;
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.moveOriginalData.width;
            tempCanvas.height = this.moveOriginalData.height;
            tempCanvas.getContext('2d').putImageData(this.moveOriginalData, 0, 0);
            overlayCtx.drawImage(tempCanvas, newX, newY);
            overlayCtx.globalAlpha = 1.0;

            // marching ants around ghost
            overlayCtx.save();
            overlayCtx.strokeStyle = '#000';
            overlayCtx.lineWidth = 1;
            overlayCtx.setLineDash([5, 5]);
            overlayCtx.strokeRect(newX, newY, this.moveOriginalRect.w, this.moveOriginalRect.h);
            overlayCtx.strokeStyle = '#fff';
            overlayCtx.strokeRect(newX, newY, this.moveOriginalRect.w, this.moveOriginalRect.h);
            overlayCtx.restore();
            this.lastMovePos = pos;
        }
    }

    onMouseUp(e) {
        if (!this.active) return;
        if (this.isSelecting && this.selectionStart) {
            const end = this.lastMovePos || this.getMousePos(e);
            const w = end.x - this.selectionStart.x;
            const h = end.y - this.selectionStart.y;
            if (Math.abs(w) > 5 && Math.abs(h) > 5) {
                this.createSelection(this.selectionStart.x, this.selectionStart.y, w, h);
            }
            this.isSelecting = false;
            this.selectionStart = null;
            this.clearOverlay();
        } else if (this.isMoving && this.moveStart) {
            const end = this.lastMovePos || this.getMousePos(e);
            const deltaX = end.x - this.moveStart.x;
            const deltaY = end.y - this.moveStart.y;
            this.applyMove(deltaX, deltaY);
            this.isMoving = false;
            this.moveStart = null;
            this.moveOriginalRect = null;
            this.moveOriginalData = null;
            this.clearOverlay();
        }
        this.lastMovePos = null;
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        let clientX, clientY;
        if (e.touches) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }
}

// Example usage (uncomment and adapt to your app):
/*
// In your main script after everything is ready:
const selectionTool = new SelectionTool({
    canvas: document.getElementById('mainCanvas'),
    ctx: document.getElementById('mainCanvas').getContext('2d'),
    selectionCanvas: document.getElementById('selectionCanvas'),
    saveFrameData: () => { /* your implementation *\/ },
    updateThumbnail: () => { /* your implementation *\/ },
    saveState: () => { /* your undo push *\/ }
});

// When user clicks the selection tool button:
function onSelectTool() {
    selectionTool.activate();
    // also deactivate other tools (pencil, eraser, etc.)
}

// When switching to another tool:
function onPencilTool() {
    selectionTool.deactivate();
}

// When loading a new frame:
function loadFrame(index) {
    // ... your loading code
    selectionTool.onFrameChange();
}

// Handle delete key:
document.addEventListener('keydown', (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectionTool.active) {
        selectionTool.delete();
    }
});
*/