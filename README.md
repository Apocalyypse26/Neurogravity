# NEUROX - AI Virality Scoring for Crypto Memes

## Project Structure

```
neurogravity/
├── src/                    # React frontend
├── backend/                # FastAPI backend
│   ├── services/          # Business logic (TRIBE pipeline)
│   ├── main.py            # FastAPI app
│   ├── requirements.txt   # Python dependencies
│   ├── start.sh           # Startup script
│   └── Dockerfile         # Container config
├── vercel.json            # Vercel config
├── render.yaml            # Render Blueprint
└── .env.production.example
```

## Deployment Guide

### Step 1: Deploy Backend on Render

1. Go to [render.com](https://render.com) and sign up
2. Click **New** → **Web Service**
3. Connect your GitHub repository
4. Configure the service:
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn main:app -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000`
   - **Environment**: Python 3.11
5. Add environment variables:
   - `USE_REAL_TRIBE=false`
   - `CORS_ORIGINS=https://your-app.vercel.app,https://*.vercel.app` (update after frontend deploy)
6. Click **Create Web Service**
7. Copy the URL (e.g., `https://neurox-api.onrender.com`)

### Step 2: Deploy Frontend on Vercel

1. Go to [vercel.com](https://vercel.com) and sign up
2. Click **Add New** → **Project**
3. Import your GitHub repository
4. Configure the project:
   - **Framework Preset**: Vite
   - **Root Directory**: `./` (root, not backend)
5. Add environment variables:
   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
   - `VITE_API_URL` = your Render backend URL (from Step 1)
6. Click **Deploy**

### Step 3: Update CORS

After frontend deployment, update Render backend environment variable:
- `CORS_ORIGINS` = `https://your-frontend.vercel.app,https://*.vercel.app`

### Step 4: Verify Deployment

- Backend health: `https://neurox-api.onrender.com/api/health`
- Frontend should load at your Vercel URL
- Test file upload and analysis

## Local Development

### Frontend
```bash
npm install
npm run dev
```

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

## Environment Variables

| Variable | Description | Where to Set |
|----------|-------------|--------------|
| `VITE_SUPABASE_URL` | Supabase project URL | Vercel |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key | Vercel |
| `VITE_API_URL` | Backend API URL | Vercel |
| `USE_REAL_TRIBE` | Use real TRIBE pipeline | Render |
| `CORS_ORIGINS` | Allowed frontend origins | Render |

## Free Tier Notes

- **Render**: Sleeps after 15 min of inactivity (cold start ~30s)
- **Vercel**: 100GB bandwidth/month
- **Supabase**: 500MB database, 1GB file storage
