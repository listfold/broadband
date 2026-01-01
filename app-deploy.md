# App Deployment: Hetzner

## Architecture

```
┌────────────────────────┐
│  Cloudflare CDN        │
│  SSL termination       │
│  DDoS protection       │
└───────────┬────────────┘
            │ HTTPS
            ▼
┌────────────────────────┐
│  Hetzner VPS (CPX31)   │
│  nginx (rate limiting) │
│  Docker container      │
│  Bun + Hono + DuckDB   │
└───────────┬────────────┘
            │ download on startup
            ▼
┌────────────────────────┐
│  Hetzner Object Storage│
│  broadband-data/       │
│  ├── raw/*.csv         │
│  └── db/*.duckdb       │
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
| `docker-compose.yml` | Local development config |
| `cloud-config.yml` | Hetzner server provisioning |
| `.github/workflows/deploy.yml` | Build, push, deploy to Hetzner |
| `.env.example` | Environment variable documentation |

## Server Sizing

| Plan | RAM | Cost | Capacity |
|------|-----|------|----------|
| CPX21 | 4GB | €4.85/mo | Dev/test |
| CPX31 | 8GB | €9.29/mo | 5-10 states |
| CPX41 | 16GB | €17.49/mo | 20-30 states |
| CCX23 | 32GB | €35.49/mo | 50 states |

---

## Step 1: Hetzner Object Storage Setup

1. Create bucket in Hetzner Cloud Console
2. Generate S3 credentials (Access Key + Secret)
3. Upload .duckdb file
4. Make bucket public OR configure presigned URLs

**Cost**: €4.99/month (includes 1TB storage + 1TB egress)

---

## Step 2: Create Hetzner Server with Cloud-Config

1. Open [Hetzner Cloud Console](https://console.hetzner.com/)
2. Create new server:
   - **Location**: Same as Object Storage (e.g., Falkenstein)
   - **Image**: Ubuntu 24.04
   - **Type**: CPX31 (8GB RAM) or larger
   - **SSH Key**: Not required (cloud-config handles this)
3. Expand "Cloud config" section
4. Paste contents of `cloud-config.yml`
5. Create server

**What cloud-config provisions automatically:**
- `deploy` user with your GitHub SSH keys
- Docker + docker-compose
- nginx with rate limiting (10 req/s, burst 20)
- fail2ban (SSH + nginx jails)
- UFW firewall (ports 22, 80 only)
- Sysctl hardening for DDoS protection
- App directory at `/opt/broadband-app/`
- Deploy script at `/opt/broadband-app/deploy.sh`

**Wait 2-3 minutes** for cloud-init to complete (server will reboot once).

---

## Step 3: Configure App Environment

SSH into the server:

```bash
ssh deploy@<server-ip>
```

Create the environment file:

```bash
cd /opt/broadband-app
cp .env.example .env
nano .env  # Set your DB_PATH
```

Example `.env`:
```
DB_PATH=https://fsn1.your-objectstorage.com/broadband-data/db/broadband.duckdb
```

---

## Step 4: Cloudflare Setup

### Add Domain to Cloudflare

1. Sign up/login at [cloudflare.com](https://cloudflare.com) (free plan)
2. Add your domain
3. Update nameservers at your registrar

### Configure DNS

1. Go to DNS settings
2. Add A record:
   - **Name**: `@` or subdomain (e.g., `api`)
   - **IPv4**: Your Hetzner server IP
   - **Proxy status**: Proxied (orange cloud)

### Configure SSL/TLS

1. Go to SSL/TLS → Overview
2. Set mode to **Flexible** (Cloudflare→server is HTTP)
3. Go to SSL/TLS → Edge Certificates
4. Enable **Always Use HTTPS**

### Cloudflare DDoS Protection (Free Tier)

Go to Security settings and enable:

| Setting | Value |
|---------|-------|
| Bot Fight Mode | On |
| Security Level | Medium |
| Browser Integrity Check | On |

**Under Attack Mode**: Enable manually during active attacks (shows CAPTCHA).

### Optional: Caching Rules

For static assets, go to Caching → Cache Rules:

1. Create rule for static files:
   - Match: `*.js`, `*.css`, `*.png`, `*.jpg`, `*.woff2`
   - Action: Cache, Edge TTL 1 month

2. Create rule to bypass cache for API:
   - Match: `/api/*`
   - Action: Bypass cache

---

## Step 5: GitHub Secrets

Add these secrets to your GitHub repository:

| Secret | Description |
|--------|-------------|
| `HETZNER_HOST` | Server IP address |
| `HETZNER_SSH_KEY` | Private SSH key for `deploy` user |
| `HETZNER_USER` | `deploy` |
| `GHCR_TOKEN` | GitHub PAT with `read:packages` scope |

### Generate SSH Key for GitHub Actions

```bash
# On your local machine
ssh-keygen -t ed25519 -f ~/.ssh/hetzner-deploy -N ""

# Add public key to server
ssh deploy@<server-ip> "cat >> ~/.ssh/authorized_keys" < ~/.ssh/hetzner-deploy.pub

# Copy private key to GitHub secret
cat ~/.ssh/hetzner-deploy
```

---

## Step 6: First Deployment

### Option A: Manual Deploy

```bash
ssh deploy@<server-ip>
cd /opt/broadband-app

# Login to GHCR (one-time)
echo $GHCR_TOKEN | docker login ghcr.io -u imaitland --password-stdin

# Deploy
./deploy.sh
```

### Option B: GitHub Actions

1. Go to Actions tab in GitHub
2. Select "Deploy to Hetzner" workflow
3. Click "Run workflow"
4. Select environment: production

---

## Deployment Flow

```
1. Developer triggers workflow_dispatch in GitHub Actions
2. GitHub Actions builds Docker image
3. Push to ghcr.io/listfold/broadband_factsheet:latest
4. SSH to Hetzner server as deploy user
5. Run /opt/broadband-app/deploy.sh
   - Pull latest image
   - Stop container
   - Start new container
   - Health check (30 attempts)
   - Prune old images
6. Brief downtime (~10-30s) while container restarts
7. App serves traffic through nginx → Cloudflare
```

---

## Security Features

### Server-Side (cloud-config)

| Feature | Protection |
|---------|------------|
| nginx rate limiting | 10 req/s per IP, burst 20 |
| nginx connection limit | 20 concurrent per IP |
| fail2ban SSH jail | 3 attempts → 24h ban |
| fail2ban nginx jail | Rate limit violations → 1h ban |
| UFW firewall | Only ports 22, 80 |
| SSH hardening | Key-only, no root, 3 max tries |
| Sysctl tuning | SYN flood protection |

### Cloudflare (free tier)

| Feature | Protection |
|---------|------------|
| SSL/TLS | Encrypted traffic |
| DDoS mitigation | Automatic L3/L4 protection |
| Bot Fight Mode | Blocks known bad bots |
| Under Attack Mode | Manual CAPTCHA challenge |
| Rate Limiting | 10,000 requests/day (free tier) |

---

## Monitoring

### Check nginx status
```bash
ssh deploy@<server-ip>
sudo nginx -t
sudo systemctl status nginx
```

### Check app logs
```bash
ssh deploy@<server-ip>
cd /opt/broadband-app
docker compose logs -f
```

### Check fail2ban bans
```bash
ssh deploy@<server-ip>
sudo fail2ban-client status sshd
sudo fail2ban-client status nginx-req-limit
```

### Check UFW status
```bash
ssh deploy@<server-ip>
sudo ufw status
```

---

## Troubleshooting

### Cloud-init not running
```bash
# Check cloud-init logs
sudo cat /var/log/cloud-init-output.log
```

### nginx not starting
```bash
sudo nginx -t  # Check config syntax
sudo journalctl -u nginx
```

### Docker login issues
```bash
# Generate a GitHub personal access token with packages:read
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
```

### App health check failing
```bash
cd /opt/broadband-app
docker compose logs
curl -v http://localhost:3000/health
```

---

## Total Monthly Cost

| Service | Cost |
|---------|------|
| Hetzner VPS (CPX31) | €9.29 |
| Hetzner Object Storage | €4.99 |
| Cloudflare | Free |
| **Total** | **€14.28/mo** |
