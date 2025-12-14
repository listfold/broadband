# SQLite vs DuckDB Evaluation for Broadband Factsheet

## Current State

**Database**: DuckDB (in-memory `:memory:`)
**Data**: ~1.2 GB CSV files in `/data/maryland/` (8 files covering different broadband technologies)
**Workload**: Read-only analytical queries after initialization (aggregations, GROUP BY, no runtime writes)
**Access Pattern**: Bulk load at startup → serve API requests with pre-aggregated `hex_summary` table

---

## DuckDB vs SQLite: Head-to-Head

| Criteria | DuckDB | SQLite |
|----------|--------|--------|
| **Query Type** | Analytical (OLAP) - aggregations, grouping | Transactional (OLTP) - point lookups, writes |
| **Storage** | Columnar (better compression) | Row-based |
| **Aggregation Speed** | 12-35× faster than SQLite | Slower for analytics |
| **Point Lookups** | Slower (~20% behind) | Faster with indexes |
| **Compression** | Excellent (28GB vs 92GB in benchmarks) | Minimal |
| **Concurrent Writes** | Limited (single writer) | Limited (single writer) |
| **Ecosystem** | Newer, growing | Massive, mature |
| **Replication** | Duckstream (experimental fork) | Litestream (production-ready) |

---

## Your Specific Use Case Analysis

### Why DuckDB is currently a good fit:
1. **Analytical workload**: Your queries use `GROUP BY`, `COUNT(DISTINCT)`, `MAX()`, `LIST()` - DuckDB excels here
2. **Read-only after init**: No concurrent write concerns
3. **Columnar compression**: Better memory efficiency for large datasets
4. **In-memory performance**: Sub-millisecond query times

### Concerns with scaling to 50 states:
1. **Memory usage**: Maryland is ~1.2GB raw CSV. All 50 states could be **25-60GB** in memory
2. **Startup time**: Loading all CSVs at boot will take longer
3. **No persistence**: In-memory DB means full reload on every restart
4. **No replication**: Data is ephemeral - server crash = reload from CSVs

---

## Litestream Evaluation

**Litestream** provides streaming replication for SQLite to S3/cloud storage.

### Key Features:
- Continuous WAL streaming (sub-second replication lag)
- Point-in-time recovery
- Costs pennies per day (uses object storage)
- Zero code changes required

### Limitations:
- **SQLite only** - does not support DuckDB
- Single-node architecture only
- Asynchronous replication (small data loss window possible)
- Restore time scales with WAL size

### Duckstream (DuckDB alternative):
A fork of Litestream for DuckDB exists ([github.com/The-Singularity-Labs/duckstream](https://github.com/The-Singularity-Labs/duckstream)), but it is **experimental** with limited adoption.

### Future Idea: WAL-based Replication for DuckDB
The Litestream approach of streaming WAL (Write-Ahead Log) changes to object storage is elegant and could potentially be adapted for DuckDB:
- Monitor DuckDB's WAL file changes
- Stream incremental changes to S3/R2
- Enable point-in-time recovery for analytical databases
- Would provide Litestream's simplicity with DuckDB's analytical performance

This could be a valuable contribution to the DuckDB ecosystem if Duckstream doesn't mature.

---

## Recommendation Matrix

| If your priority is... | Use |
|------------------------|-----|
| **Query performance for analytics** | DuckDB |
| **Production-ready replication** | SQLite + Litestream |
| **Minimal memory footprint** | SQLite (persisted on disk) |
| **Growing multi-state data** | SQLite (disk-based) or DuckDB with file persistence |
| **Simple disaster recovery** | SQLite + Litestream |

---

## Your Context

- **Goal**: Both disaster recovery AND memory efficiency
- **Deployment**: Hetzner with blue-green deployments (2 servers, load balancing, failover)
- **Startup tolerance**: Acceptable since traffic routes to healthy server during rebuild

---

## Implementation Plan

### Scope
1. Switch from `:memory:` to file-based DuckDB
2. Create GitHub Action to pre-build the `.duckdb` file
3. Store CSVs and built DB in Cloudflare R2

---

### Storage Analysis

**Data size projections:**
- Current: ~1.2 GB raw CSV (Maryland)
- Future: ~25-60 GB raw CSV (50 states)
- DuckDB compressed: ~40-60% of raw size → ~10-35 GB

**GitHub limits (won't work for 50 states):**
- Release assets: 2 GB max per file
- Artifacts: 2 GB max, 500MB free storage
- ❌ Both hit limits quickly

**S3-compatible storage comparison:**

| Provider | Storage | Egress | 25GB/month cost |
|----------|---------|--------|-----------------|
| AWS S3 | $0.023/GB | High fees | ~$0.58 + egress |
| Cloudflare R2 | $0.015/GB | **Free** | ~$0.38 |
| Backblaze B2 | $0.006/GB | Free via CF | ~$0.15 |

**Recommendation: Cloudflare R2**
- Zero egress fees (deployments pull for free)
- Free tier: 10GB storage, 10M reads/mo, 1M writes/mo
- S3-compatible API
- Simple pricing, no surprise bills

---

### Architecture

```
CSVs (raw data) ──┐
                  ├──> R2 bucket (broadband-data)
.duckdb (built)  ──┘
                        │
                        ▼
              GitHub Action (manual trigger)
                        │
                        ▼
              Server pulls .duckdb on deploy
```

**R2 Bucket Structure:**
```
broadband-data/
├── raw/
│   └── maryland/
│       ├── cable.csv
│       ├── fiber.csv
│       └── ...
└── db/
    └── broadband.duckdb
```

---

### Files to Create/Modify

**1. `db/duckdb.ts`** - Support loading from URL or local file

```typescript
const DB_PATH = process.env.DB_PATH || './data/broadband.duckdb'

export async function initDatabase(): Promise<void> {
  // If DB_PATH is a URL, download it first
  if (DB_PATH.startsWith('http')) {
    const localPath = './data/broadband.duckdb'
    if (!await Bun.file(localPath).exists()) {
      console.log(`Downloading database from ${DB_PATH}...`)
      const response = await fetch(DB_PATH)
      await Bun.write(localPath, response)
    }
    db = new duckdb.Database(localPath)
  } else {
    db = new duckdb.Database(DB_PATH)
  }

  conn = db.connect()

  // Check if pre-built, else build from CSVs...
}
```

**2. `scripts/build-db.ts`** - Build + upload to R2

**3. `.github/workflows/build-db.yml`** - Trigger on manual dispatch

**4. `.gitignore`** - Add `data/*.duckdb`

---

### Implementation Steps

1. **Set up Cloudflare R2 bucket** (manual, one-time)
   - Create bucket `broadband-data`
   - Generate API token with read/write access

2. **Migrate CSVs to R2**
   - Upload existing CSVs to `raw/maryland/`
   - Remove CSVs from git (they're too large anyway)

3. **Modify `db/duckdb.ts`**
   - Support DB_PATH env var (URL or local path)
   - Download from R2 if URL provided
   - Fall back to CSV loading for local dev

4. **Create `scripts/build-db.ts`**
   - Download CSVs from R2
   - Build database
   - Upload .duckdb to R2

5. **Create GitHub Action**
   - Trigger manually or on workflow dispatch
   - Pull CSVs → Build → Push .duckdb

6. **Update deployment**
   - Set `DB_PATH=https://[bucket].r2.cloudflarestorage.com/db/broadband.duckdb`
   - Server downloads DB on first request

---

### Cost Estimate (50 states)

| Item | Size | Monthly Cost |
|------|------|--------------|
| Raw CSVs | ~50 GB | $0.75 |
| Built .duckdb | ~25 GB | $0.38 |
| **Total** | ~75 GB | **~$1.13/month** |

Free tier covers development. Production cost is negligible.

---

## Sources

- [DuckDB vs SQLite - DataCamp](https://www.datacamp.com/blog/duckdb-vs-sqlite-complete-database-comparison)
- [DuckDB vs SQLite - MotherDuck](https://motherduck.com/learn-more/duckdb-vs-sqlite-databases/)
- [Litestream](https://litestream.io/)
- [Litestream Tips & Caveats](https://litestream.io/tips/)
- [Duckstream](https://github.com/The-Singularity-Labs/duckstream)
- [Fly.io on SQLite + Litestream](https://fly.io/blog/all-in-on-sqlite-litestream/)
- [Comparing Litestream, rqlite, dqlite](https://gcore.com/learning/comparing-litestream-rqlite-dqlite)
- [Cloudflare R2 vs alternatives](https://onidel.com/blog/cloudflare-r2-vs-backblaze-b2)
- [GitHub Limits](https://devopsvisions.github.io/blog/posts/github-limits/)
