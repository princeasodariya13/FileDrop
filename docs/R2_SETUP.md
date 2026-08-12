# Cloudflare R2 Setup

1. **Create a Cloudflare account** (or use an existing one) at
   https://dash.cloudflare.com.
2. **Create a bucket**: R2 → Create bucket → name it (e.g. `filedrop-prod`).
3. **Create an API token**: R2 → Manage R2 API Tokens → Create API Token.
   Grant it **Object Read & Write** on the bucket you just created. Copy the
   Access Key ID and Secret Access Key immediately — the secret is only
   shown once.
4. **Note your Account ID** (shown in the R2 dashboard sidebar) and
   construct the S3-compatible endpoint:
   `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
5. **Configure CORS** on the bucket so the browser can PUT parts directly
   and GET downloads. In the bucket settings → CORS Policy:
   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:3000", "https://your-production-domain.com"],
       "AllowedMethods": ["PUT", "GET"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   `ExposeHeaders: ["ETag"]` is required — the browser needs to read the
   ETag from each part's PUT response to complete the multipart upload.
6. **Lifecycle rules (optional but recommended)**: R2 → bucket → Lifecycle
   Rules → add a rule to abort incomplete multipart uploads after, say, 3
   days, as a backstop in case the app's own cleanup job misses one.
7. **Fill in `.env`**:
   ```
   R2_ACCOUNT_ID=...
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   R2_BUCKET_NAME=filedrop-prod
   R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   ```

Never commit these values or expose them to the frontend — the backend is
the only thing that holds R2 credentials; the frontend only ever receives
short-lived presigned URLs.
