# App Deployment: Hetzner

## Architecture

```
┌────────────────────────┐
│  Hetzner Object Storage│
│  broadband-data/       │
│  ├── raw/*.csv         │
│  └── db/*.duckdb       │
└───────────┬────────────┘
            │ download on startup (same DC = fast)
            ▼
┌────────────────────────┐
│  Hetzner VPS (CPX31)   │
│  Docker container      │
│  Bun + Hono + DuckDB   │
└────────────────────────┘
            ▲
            │ docker pull
┌───────────┴────────────┐
│  GitHub Actions        │
│  Build → GHCR → Deploy │
└────────────────────────┘
```

## Why Hetzner (Not Cloudflare Workers)

DuckDB requires:
- Native C++ bindings (Node-API)
- In-memory database persistence
- Disk access for DB files
- 1GB+ RAM (Maryland alone), 10-35GB for 50 states

Cloudflare Workers limitations:
- 128MB memory (2GB max on paid)
- No native bindings support
- Stateless execution model
- No disk access

## Why Docker (Not `bun build --compile`)

`bun build --compile` creates single binaries but [doesn't work with native N-API addons like DuckDB](https://github.com/oven-sh/bun/issues/17312).

## Implementation Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage Bun build |
| `docker-compose.yml` | Production container config |
| `.github/workflows/deploy.yml` | Build, push, deploy to Hetzner |
| `.env.example` | Environment variable documentation |

## Server Sizing

| Plan | RAM | Cost | Capacity |
|------|-----|------|----------|
| CPX21 | 4GB | €4.85/mo | Dev/test |
| CPX31 | 8GB | €9.29/mo | 5-10 states |
| CPX41 | 16GB | €17.49/mo | 20-30 states |
| CCX23 | 32GB | €35.49/mo | 50 states |

## Deployment Flow

```
1. Developer triggers workflow_dispatch in GitHub Actions
2. GitHub Actions builds Docker image
3. Push to ghcr.io/OWNER/broadband_factsheet:latest
4. SSH to Hetzner server
5. docker compose pull && docker compose up -d
6. Container starts, downloads DB from Hetzner Object Storage
7. Health check: GET /health
8. App serves traffic on port 3000
```

## GitHub Secrets Required

| Secret | Description |
|--------|-------------|
| `HETZNER_HOST` | Server IP address |
| `HETZNER_SSH_KEY` | Private SSH key (no passphrase) |
| `HETZNER_USER` | SSH username |

## Environment Variables

| Variable | Production | Description |
|----------|------------|-------------|
| `DB_PATH` | `https://fsn1...` | Hetzner Object Storage URL |
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `production` | Environment |

## Hetzner Server Setup (One-time)

```bash
# 1. Install Docker
curl -fsSL https://get.docker.com | sh

# 2. Create app directory
mkdir -p /opt/broadband-app
cd /opt/broadband-app

# 3. Create docker-compose.yml (copy from repo)
# 4. Create .env with DB_PATH

# 5. Login to GHCR
echo $GHCR_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# 6. Start app
docker compose up -d
```

## Hetzner Object Storage Setup

1. Create bucket in Hetzner Cloud Console
2. Generate S3 credentials (Access Key + Secret)
3. Upload .duckdb file
4. Make bucket public OR configure presigned URLs

**Cost**: €4.99/month (includes 1TB storage + 1TB egress)

## Total Monthly Cost

| Service | Cost |
|---------|------|
| Hetzner VPS (CPX31) | €9.29 |
| Hetzner Object Storage | €4.99 |
| **Total** | **€14.28/mo** |

## Next Steps

- [ ] Create Hetzner Cloud account
- [ ] Create Object Storage bucket
- [ ] Upload pre-built .duckdb to bucket
- [ ] Provision VPS (CPX31, Ubuntu 24.04)
- [ ] Run server setup commands
- [ ] Add GitHub secrets
- [ ] Trigger first deploy
- [ ] Configure domain + SSL (Cloudflare or Let's Encrypt)
