# Deployment Guide

## Initial Setup (One-Time)

### Prerequisites

No Cloudflare account needed initially - the free tier includes 10GB R2 storage.

### Step 1: Create Cloudflare Account

1. Go to https://dash.cloudflare.com/sign-up
2. Verify your email
3. No credit card required for free tier

### Step 2: Install CLI Tools

```bash
# Install Wrangler (Cloudflare CLI)
bun add -g wrangler

# Install rclone (for bulk uploads)
brew install rclone
```

### Step 3: Authenticate Wrangler

```bash
# Login (opens browser for OAuth)
wrangler login

# Verify login and get account ID
wrangler whoami
```

### Step 4: Create R2 Bucket

```bash
# Create the bucket
wrangler r2 bucket create broadband-data

# Verify creation
wrangler r2 bucket list
```

### Step 5: Create R2 API Token

API tokens are needed for rclone and GitHub Actions.

1. Go to: **Cloudflare Dashboard → R2 → Manage R2 API Tokens**
2. Click **Create API Token**
3. Set permissions: **Object Read & Write**
4. Specify bucket: `broadband-data`
5. Save these values:
   - `Access Key ID`
   - `Secret Access Key`

### Step 6: Configure rclone

```bash
# Load credentials from .env
source .env

# Configure rclone using env vars
rclone config create r2 s3 \
  provider=Cloudflare \
  access_key_id=$R2_ACCESS_KEY_ID \
  secret_access_key=$R2_SECRET_ACCESS_KEY \
  endpoint=$R2_ENDPOINT \
  acl=private \
  no_check_bucket=true

# Test connection
rclone lsd r2:
```

**Note:** Credentials are stored in `.env` (gitignored). The format is:
```bash
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET=broadband-data
R2_ENDPOINT=https://your_account_id.r2.cloudflarestorage.com
```

### Step 7: Upload CSVs to R2

```bash
# Sync local CSVs to R2
rclone sync ./data/maryland r2:broadband-data/raw/maryland --progress

# Verify upload
rclone ls r2:broadband-data/raw/maryland
```

### Step 8: Build and Upload Database

```bash
# Build database locally
bun scripts/build-db.ts

# Upload to R2 (option 1: wrangler)
wrangler r2 object put broadband-data/db/broadband.duckdb \
  --file ./data/broadband.duckdb

# Upload to R2 (option 2: rclone)
rclone copy ./data/broadband.duckdb r2:broadband-data/db/
```

### Step 9: Configure GitHub Secrets

Add these secrets to your repo: **Settings → Secrets and variables → Actions**

| Secret | Value |
|--------|-------|
| `R2_ACCOUNT_ID` | Your Cloudflare account ID (from `wrangler whoami`) |
| `R2_ACCESS_KEY_ID` | From Step 5 |
| `R2_SECRET_ACCESS_KEY` | From Step 5 |

### Step 10: Enable Public Access (Optional)

For the server to download the database without authentication:

1. Go to: **Cloudflare Dashboard → R2 → broadband-data → Settings**
2. Enable **Public Access** or configure a custom domain
3. Your public URL will be: `https://pub-XXXX.r2.dev/db/broadband.duckdb`

---

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐
│   Cloudflare    │     │    GitHub       │
│       R2        │     │    Actions      │
│                 │     │                 │
│  raw/           │────▶│  build-db.yml   │
│    maryland/    │     │                 │
│      *.csv      │     └────────┬────────┘
│                 │              │
│  db/            │◀─────────────┘
│    broadband.   │     (uploads built DB)
│    duckdb       │
└────────┬────────┘
         │
         │ (server pulls on startup)
         ▼
┌─────────────────┐     ┌─────────────────┐
│   Hetzner       │     │   Hetzner       │
│   Server A      │     │   Server B      │
│                 │     │                 │
│   (active)      │────▶│   (standby)     │
│                 │     │                 │
└─────────────────┘     └─────────────────┘
     Load Balancer / Blue-Green
```

---

## Data Storage

### Cloudflare R2 Bucket

**Bucket name**: `broadband-data`

**Structure**:
```
broadband-data/
├── raw/
│   ├── maryland/
│   │   ├── bdc_24_Cable_fixed_broadband_*.csv
│   │   ├── bdc_24_Fiber_fixed_broadband_*.csv
│   │   └── ...
│   ├── virginia/
│   │   └── ...
│   └── [other states]/
└── db/
    └── broadband.duckdb
```

**Credentials** (stored in GitHub Secrets):
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

**Public URL**: `https://broadband-data.[account].r2.cloudflarestorage.com/db/broadband.duckdb`

---

## Database Build Process

### Manual Trigger

Run the GitHub Action `build-db.yml` via workflow dispatch:
```
GitHub → Actions → Build DuckDB → Run workflow
```

### What the build does:
1. Downloads CSVs from R2 `raw/` folder
2. Runs `bun scripts/build-db.ts` to create DuckDB file
3. Uploads `broadband.duckdb` to R2 `db/` folder

### Local Development

CSVs can remain in `./data/[state]/` for local development. The app will:
1. Check for existing `broadband.duckdb` file
2. If not found, build from local CSVs
3. If `DB_PATH` env var is a URL, download from R2

---

## Server Deployment

### Environment Variables

| Variable | Production | Development |
|----------|------------|-------------|
| `DB_PATH` | `https://...r2.../db/broadband.duckdb` | `./data/broadband.duckdb` |

### Startup Flow

```typescript
// Server startup (simplified)
if (DB_PATH is URL) {
  download from R2 → ./data/broadband.duckdb
}

if (broadband.duckdb exists) {
  open existing database (instant)
} else {
  build from CSVs (slow, fallback)
}
```

### Blue-Green Deployment

1. **Deploy to standby server** (Server B)
2. Server B downloads new `.duckdb` from R2
3. Server B starts, loads DB into memory
4. **Health check passes** → switch traffic to Server B
5. Server A becomes new standby

**Key benefit**: Zero downtime. Users never wait for DB loading.

---

## Adding New States

When new state CSV files are obtained, follow these steps to update the database.

### Step 1: Upload New CSVs to R2

```bash
# Load credentials
source .env

# Upload new state CSVs (replace 'virginia' with actual state)
rclone sync ./data/virginia r2:broadband-data/raw/virginia --progress

# Verify upload
rclone ls r2:broadband-data/raw/virginia
```

**Expected structure after upload:**
```
broadband-data/
├── raw/
│   ├── maryland/
│   │   └── *.csv
│   ├── virginia/      ← new state
│   │   └── *.csv
│   └── [other states]/
└── db/
    └── broadband.duckdb
```

### Step 2: Update Build Script (if needed)

If new states use different file naming conventions, update `db/duckdb.ts`:
- Add new state directory to the data loading logic
- Update `FIXED_BROADBAND_FILES` array if filenames differ

### Step 3: Rebuild the Database

**Option A: Local rebuild (recommended for testing)**
```bash
# Remove existing database
rm -f ./data/broadband.duckdb

# Download all CSVs from R2
rclone sync r2:broadband-data/raw ./data --progress

# Build database
bun scripts/build-db.ts

# Verify build
ls -lh ./data/broadband.duckdb
```

**Option B: GitHub Actions**
1. Go to: **GitHub → Actions → Build DuckDB → Run workflow**
2. Enable "Upload to Cloudflare R2" option
3. Wait for workflow to complete

### Step 4: Upload Updated Database to R2

```bash
# Upload rebuilt database
rclone copy ./data/broadband.duckdb r2:broadband-data/db/ --progress

# Verify upload
rclone ls r2:broadband-data/db/
```

### Step 5: Deploy Updated Servers

For blue-green deployment:
1. Deploy to standby server
2. Server downloads new `.duckdb` from R2 on startup
3. Health check passes → switch traffic
4. Repeat for other server

**For immediate update (if using local DB):**
```bash
# On each server, force re-download
rm -f ./data/broadband.duckdb
# Restart application - it will download fresh DB from R2
```

### Quick Reference: Full Update Cycle

```bash
# 1. Upload new state CSVs
rclone sync ./data/newstate r2:broadband-data/raw/newstate --progress

# 2. Download all CSVs locally
rclone sync r2:broadband-data/raw ./data --progress

# 3. Rebuild database
rm -f ./data/broadband.duckdb
bun scripts/build-db.ts

# 4. Upload new database
rclone copy ./data/broadband.duckdb r2:broadband-data/db/ --progress

# 5. Verify
rclone ls r2:broadband-data/
```

---

## Cost Estimate

| Data Size | R2 Storage | Monthly Cost |
|-----------|------------|--------------|
| 1 state (~1.5 GB) | ~2 GB | Free tier |
| 10 states (~15 GB) | ~20 GB | ~$0.30 |
| 50 states (~75 GB) | ~100 GB | ~$1.50 |

**Egress**: Free (R2 has no egress fees)

---

## Disaster Recovery

### Current State
- CSVs in R2 are the source of truth
- `.duckdb` can be rebuilt anytime from CSVs
- Blue-green deployment prevents downtime

### Future: WAL-based Replication
For real-time DR, consider Litestream-style WAL streaming for DuckDB:
- Stream DuckDB changes to S3/R2
- Enable point-in-time recovery
- See: [Duckstream](https://github.com/The-Singularity-Labs/duckstream) (experimental)

---

## Troubleshooting

### Server won't start
1. Check `DB_PATH` env var is set correctly
2. Verify R2 bucket is accessible (CORS, credentials)
3. Check disk space for downloaded `.duckdb`

### Slow startup
- Database is being built from CSVs (fallback mode)
- Solution: Ensure `DB_PATH` points to pre-built R2 database

### Out of memory
- DuckDB loads data into RAM
- Solution: Use larger Hetzner instance (32GB+ for 50 states)

### Build fails in GitHub Action
1. Check R2 credentials in GitHub Secrets
2. Verify CSV files exist in R2 `raw/` folder
3. Check GitHub Action logs for specific error
