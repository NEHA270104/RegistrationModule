# Deployment Guide

## Quick Deploy (Recommended)

Run the deploy script:
```bash
# Windows (PowerShell)
.\deploy.ps1

# Windows (Command Prompt)
powershell -ExecutionPolicy Bypass -File deploy.ps1
```

## Manual Deployment Steps

### 1. Commit and Push to GitHub
```bash
git add .
git commit -m "Your commit message"
git push origin main
```

### 2. Deploy Frontend to Firebase Hosting
```bash
firebase deploy --only hosting
```
- **URL:** https://bizflowai-478116.web.app

### 3. Deploy Backend to GCP Cloud Run
```bash
gcloud builds submit --config=cloudbuild.yaml --project=bizflowai-478116
```
- **Region:** asia-south1
- **Service:** bizflow-registration

## Environment Setup

### Prerequisites
1. **Node.js** (v18+)
2. **Firebase CLI:** `npm install -g firebase-tools`
3. **Google Cloud SDK:** [Install](https://cloud.google.com/sdk/docs/install)

### First-time Setup
```bash
# Login to Firebase
firebase login

# Login to GCP
gcloud auth login
gcloud config set project bizflowai-478116
```

## Architecture

```
Firebase Hosting (Frontend)
    |
    |-- /api/** --> Cloud Run (Backend)
    |
    v
bizflowai-478116.web.app
```

- **Frontend:** Static files served from Firebase Hosting
- **Backend API:** Proxied to Cloud Run service via Firebase rewrites
- **Database:** Supabase (PostgreSQL)
- **Payments:** Razorpay

## Useful Commands

```bash
# Kill port 3000 (if stuck)
cd backend && npm run kill-port

# Run backend locally
cd backend && npm run dev

# Build backend
cd backend && npm run build

# Check Cloud Run logs
gcloud run services logs read bizflow-registration --region=asia-south1 --project=bizflowai-478116

# Check build status
gcloud builds list --project=bizflowai-478116 --limit=5
```

## Secrets (GCP Secret Manager)

The following secrets are configured in GCP:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`

To update a secret:
```bash
echo -n "your-secret-value" | gcloud secrets versions add SECRET_NAME --data-file=- --project=bizflowai-478116
```
