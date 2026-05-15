// ============================================================
//  QUEBAME BACKEND — server.js
//  Paste your Hugging Face token below and you're good to go.
// ============================================================

const HF_TOKEN = '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';   // ← paste here

// ============================================================
//  (nothing else to change below this line)
// ============================================================

const express  = require('express');
const cors     = require('cors');
const fetch    = require('node-fetch');
const path     = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));   // serves quebame HTML

// ── Health check ────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    tokenConfigured: HF_TOKEN !== 'PASTE_YOUR_HF_TOKEN_HERE' && HF_TOKEN.length > 10
  });
});

// ── Shared generation logic ──────────────────────────────────
async function generateImage(prompt, { negative_prompt, width, height, seed, model } = {}) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('Prompt is required');
  }

  const modelId = model || 'black-forest-labs/FLUX.1-dev';
  const apiUrl  = `https://router.huggingface.co/hf-inference/models/${modelId}`;

  console.log(`[AI] Generating: "${prompt.slice(0, 70)}..." via ${modelId}`);

  const hfRes = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${HF_TOKEN}`,
      'Content-Type':  'application/json',
      'x-use-cache':   'false'
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        negative_prompt:     negative_prompt || '',
        width:               Number(width)  || 512,
        height:              Number(height) || 512,
        seed:                seed           || undefined,
        num_inference_steps: 28,
        guidance_scale:      7.5
      }
    })
  });

  if (!hfRes.ok) {
    const txt = await hfRes.text();
    const err = new Error(`HuggingFace API error ${hfRes.status}: ${txt}`);
    err.status = hfRes.status;
    throw err;
  }

  const arrayBuffer = await hfRes.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ── POST /api/generate-image  (returns raw PNG) ──────────────
app.post('/api/generate-image', async (req, res) => {
  if (HF_TOKEN === 'PASTE_YOUR_HF_TOKEN_HERE') {
    return res.status(500).json({ error: 'Token not set. Open server.js and paste your HF token.' });
  }

  try {
    const buffer = await generateImage(req.body.prompt, req.body);
    res.set('Content-Type',   'image/png');
    res.set('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error('[AI]', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── POST /api/generate-image-base64  (returns JSON + base64) ─
app.post('/api/generate-image-base64', async (req, res) => {
  if (HF_TOKEN === 'PASTE_YOUR_HF_TOKEN_HERE') {
    return res.status(500).json({ error: 'Token not set. Open server.js and paste your HF token.' });
  }

  try {
    const { prompt, width, height } = req.body;
    const buffer = await generateImage(prompt, req.body);
    const base64 = buffer.toString('base64');

    res.json({
      success: true,
      image:   `data:image/png;base64,${base64}`,
      prompt:  prompt,
      width:   Number(width)  || 512,
      height:  Number(height) || 512
    });
  } catch (err) {
    console.error('[AI]', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  const tokenOk = HF_TOKEN !== 'PASTE_YOUR_HF_TOKEN_HERE' && HF_TOKEN.length > 10;
  console.log(`🚀  Quebame Backend  →  http://localhost:${PORT}`);
  console.log(`🔒  HF Token: ${tokenOk ? 'CONFIGURED ✓' : 'NOT SET — paste your token in server.js!'}`);
  console.log(`🎨  Endpoints:`);
  console.log(`     POST /api/generate-image         → raw PNG`);
  console.log(`     POST /api/generate-image-base64  → JSON base64`);
  console.log(`     GET  /api/health                 → status check`);
});
