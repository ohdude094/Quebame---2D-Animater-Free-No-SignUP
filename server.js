const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const HF_TOKEN = process.env.HF_TOKEN;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', tokenConfigured: !!HF_TOKEN });
});

// AI Image Generation Proxy - Returns raw PNG blob
app.post('/api/generate-image', async (req, res) => {
  if (!HF_TOKEN) {
    return res.status(500).json({ error: 'HF_TOKEN not configured on server' });
  }

  const { prompt, negative_prompt, width, height, seed, model } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  const modelId = model || 'black-forest-labs/FLUX.1-dev';
  const apiUrl = `https://router.huggingface.co/hf-inference/models/${modelId}`;

  try {
    console.log(`[AI] Generating: "${prompt.substring(0, 60)}..." via ${modelId}`);

    const hfResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/json',
        'x-use-cache': 'false'
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          negative_prompt: negative_prompt || '',
          width: width || 512,
          height: height || 512,
          seed: seed || undefined,
          num_inference_steps: 28,
          guidance_scale: 7.5
        }
      })
    });

    if (!hfResponse.ok) {
      const errText = await hfResponse.text();
      console.error(`[AI] HF error ${hfResponse.status}:`, errText);
      return res.status(hfResponse.status).json({ 
        error: `HuggingFace API error: ${hfResponse.status}`, 
        details: errText 
      });
    }

    const blob = await hfResponse.blob();
    const buffer = await blob.arrayBuffer();

    res.set('Content-Type', 'image/png');
    res.set('Content-Length', buffer.byteLength);
    res.send(Buffer.from(buffer));

  } catch (error) {
    console.error('[AI] Server error:', error.message);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Alternative: Base64 JSON response (easier for frontend)
app.post('/api/generate-image-base64', async (req, res) => {
  if (!HF_TOKEN) {
    return res.status(500).json({ error: 'HF_TOKEN not configured on server' });
  }

  const { prompt, negative_prompt, width, height, seed, model } = req.body;
  const modelId = model || 'black-forest-labs/FLUX.1-dev';
  const apiUrl = `https://router.huggingface.co/hf-inference/models/${modelId}`;

  try {
    const hfResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          negative_prompt: negative_prompt || '',
          width: width || 512,
          height: height || 512,
          seed: seed || undefined
        }
      })
    });

    if (!hfResponse.ok) {
      const errText = await hfResponse.text();
      return res.status(hfResponse.status).json({ 
        error: `HuggingFace API error: ${hfResponse.status}`, 
        details: errText 
      });
    }

    const blob = await hfResponse.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    res.json({
      success: true,
      image: `data:image/png;base64,${base64}`,
      prompt: prompt,
      width: width || 512,
      height: height || 512
    });

  } catch (error) {
    console.error('[AI] Server error:', error.message);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Quebame Backend running on http://localhost:${PORT}`);
  console.log(`🎨 AI Proxy: POST http://localhost:${PORT}/api/generate-image`);
  console.log(`🔒 HF Token configured: ${HF_TOKEN ? 'YES' : 'NO - Set HF_TOKEN in .env file!'}`);
});
