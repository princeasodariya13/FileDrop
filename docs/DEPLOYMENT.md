# FileDrop Deployment Guide

This document outlines the standard procedure for deploying the FileDrop frontend and backend to production. These instructions are provider-neutral and can be applied to any PaaS, VM, or container-based environment.

## 1. Prerequisites
- Node.js (v18+)
- MongoDB cluster (e.g., MongoDB Atlas or self-hosted)
- A registered domain name (optional but recommended for HTTPS)

## 2. MongoDB Configuration
FileDrop requires a MongoDB connection. 
- Ensure your MongoDB instance is **not** exposed unnecessarily to the public internet (use IP whitelisting or VPC peering).
- Use least-privilege credentials (a dedicated user with only read/write access to the `filedrop` database).
- Use a separate database for production vs development.

## 3. Backend Environment
Configure the following environment variables on your backend hosting provider:

```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/filedrop
FRONTEND_ORIGIN=https://your-production-domain.com

# Resource Limits (Optional, defaults apply if omitted)
MAX_FILE_SIZE=10GB
MAX_ACTIVE_STORAGE=50GB
RATE_LIMIT_UPLOAD_PER_HOUR=20
RATE_LIMIT_DOWNLOAD_PER_HOUR=60
```
*Note: Do NOT expose backend secrets to the frontend.*

## 4. Frontend Environment
Configure the following environment variables on your frontend hosting provider:

```env
NEXT_PUBLIC_API_URL=https://api.your-production-domain.com
```

## 5. Backend Build
Run the following commands in the `backend/` directory to build the API:
```bash
npm install
npm run build
```

## 6. Frontend Build
Run the following commands in the `frontend/` directory to build the web application:
```bash
npm install
npm run build
```

## 7. Starting Production Servers
The standard startup sequence should be:
1. Ensure **MongoDB** is running and accessible.
2. Start the **Backend**:
   ```bash
   cd backend && npm start
   ```
3. Verify the backend is ready via the **Health Check** endpoint (`GET /health`).
4. Start the **Frontend**:
   ```bash
   cd frontend && npm start
   ```

*Note: The frontend does not connect to MongoDB directly. It communicates exclusively via the backend API.*

## 8. CORS Configuration
The backend automatically configures strict CORS using the `FRONTEND_ORIGIN` environment variable. Ensure this precisely matches your production frontend URL (e.g., `https://filedrop.example.com`).

## 9. Health Check
The backend exposes a `GET /health` endpoint that returns a simple status object without leaking sensitive data:
```json
{
  "success": true,
  "data": {
    "api": "ok",
    "database": "connected"
  }
}
```
Use this for your load balancer's liveness or readiness probes.

## 10. Cleanup Job
The backend automatically runs a cron job every 5 minutes to sweep expired/exhausted files and abandoned uploads. 
- It operates safely in production and respects expiration boundaries. 
- It runs inside the Node.js process, so no external cron service is required.

## 11. HTTPS Configuration
Production traffic **must** run over HTTPS. 
- Do not attempt to generate SSL certificates in the application code.
- Terminate SSL at your load balancer, CDN, or reverse proxy (e.g., NGINX, Cloudflare, AWS ALB).
- The Express backend is configured to `trust proxy`, allowing it to correctly identify client IP addresses for rate limiting behind a load balancer.

## 12. Storage Provider Integration Deferred
**Real object storage is not currently configured. MockStorageService is active.**
Do not use this deployment for actual production file transfers until a real S3-compatible provider (e.g., Cloudflare R2, AWS S3) is fully integrated into `backend/src/services/storage.service.ts`.
