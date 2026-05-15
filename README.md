# Quebame Backend 🔒

Secure Node.js backend for the Quebame Animator. This server:
- **Hides your Hugging Face token** from users
- **Serves** your animator HTML/CSS/JS
- **Proxies** AI image generation requests to Hugging Face

---

## 📁 Folder Structure

```
quebame-backend/
├── server.js           # Main Express server
├── package.json        # Dependencies
├── .env.example        # Template for environment variables
├── .gitignore          # Prevents .env from being committed
├── public/             # Put your quebame.html here
│   └── index.html
└── README.md           # This file
```

---

## 🚀 Local Setup

### 1. Install Node.js
Download from [nodejs.org](https://nodejs.org/) (version 18+ recommended).

### 2. Create Project Folder
Copy all files from this folder into a new folder named `quebame-backend`.

### 3. Install Dependencies
```bash
cd quebame-backend
npm install
```

### 4. Add Your Hugging Face Token
```bash
cp .env.example .env
```

Edit `.env` and paste your real token:
```env
HF_TOKEN=hf_your_real_token_here
PORT=3000
```

> ⚠️ **CRITICAL:** `.env` is listed in `.gitignore` so it will NEVER be uploaded to GitHub.

### 5. Add Your Animator
Place your `quebame.html` inside the `public/` folder and rename it to `index.html`:
```bash
# Copy your animator file
cp /path/to/your/quebame.html public/index.html
```

### 6. Start the Server
```bash
npm start
```

For development (auto-restart on file changes):
```bash
npm run dev
```

Open your browser to: **http://localhost:3000**

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Serves your animator (from `public/index.html`) |
| GET | `/api/health` | Check if server and token are configured |
| POST | `/api/generate-image` | Returns raw PNG image blob |
| POST | `/api/generate-image-base64` | Returns JSON with base64 image string |

### Example API Call (from frontend):
```javascript
const response = await fetch('/api/generate-image-base64', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: "A cute cartoon cat, white background",
    width: 512,
    height: 512,
    negative_prompt: "blurry, distorted"
  })
});

const data = await response.json();
// data.image contains "data:image/png;base64,iVBORw0KGgo..."
```

---

## 🌐 Deploy to Render (Free Hosting + GitHub)

### Step 1: Push to GitHub
```bash
cd quebame-backend
git init
git add .
git commit -m "Initial backend setup"
```

Go to [github.com](https://github.com), create a new repository (e.g., `quebame-backend`), and push:
```bash
git remote add origin https://github.com/YOUR_USERNAME/quebame-backend.git
git branch -M main
git push -u origin main
```

> ⚠️ **Verify `.env` is NOT in your repo before pushing:**
> ```bash
> git ls-files | grep env
> # Should return NOTHING
> ```

### Step 2: Deploy on Render
1. Go to [render.com](https://render.com) and sign up/login (free)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repo `quebame-backend`
4. Settings:
   - **Name:** `quebame-backend`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** Free
5. Click **"Advanced"** and add **Environment Variable**:
   - Key: `HF_TOKEN`
   - Value: `hf_your_real_token_here`
6. Click **Create Web Service**

Render will give you a URL like:
```
https://quebame-backend.onrender.com
```

Your animator will be live at that URL, and your token is **100% secure** on Render's servers.

---

## 🛡️ Security Checklist

- [ ] `.env` is in `.gitignore`
- [ ] `.env` is NEVER committed to GitHub
- [ ] Token is only stored in hosting platform's environment variables
- [ ] Repository is private (optional but recommended)
- [ ] Token has only **"Read"** access on Hugging Face

---

## 🎨 Frontend Integration

In your Quebame HTML file, replace the direct Hugging Face API call with this backend call:

```javascript
// BEFORE (unsafe - token exposed):
const response = await fetch('https://router.huggingface.co/...', {
  headers: { 'Authorization': 'Bearer hf_xxxx' } // ❌ VISIBLE TO EVERYONE
});

// AFTER (safe - token hidden on server):
const response = await fetch('/api/generate-image-base64', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: "your prompt here" })
});
const data = await response.json();
const imgSrc = data.image; // Base64 ready to use
```

A complete frontend snippet is provided in `public/frontend-snippet.js`.

---

## 🆘 Troubleshooting

| Problem | Solution |
|---------|----------|
| `HF_TOKEN not configured` | Create `.env` file and add your token |
| `Cannot find module 'express'` | Run `npm install` |
| CORS errors in browser | Backend already has `cors()` enabled |
| HuggingFace returns 429 | Free tier rate limit; wait 1 minute or upgrade |
| HuggingFace returns 401 | Token is invalid or expired; create a new one |

---

## 📜 License

MIT
