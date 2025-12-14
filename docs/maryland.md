# Maryland Broadband Map

Interactive hex-based map visualization of FCC broadband data for Maryland.

## Architecture Overview

This implementation maintains strict separation of concerns:

| Layer | Tool | Responsibility |
|-------|------|----------------|
| **Runtime** | Bun | JavaScript/TypeScript execution |
| **Build** | Bun | Bundle HTML/TS/CSS to `dist/` |
| **Server** | Hono | HTTP routing, API endpoints, static file serving |
| **Database** | DuckDB | In-memory SQL queries on CSV data |
| **Frontend** | Leaflet + H3.js | Map rendering with hexagonal grid |
| **Interactivity** | Alpine.js + HTMX | Reactive UI without heavy frameworks |

### Why This Separation?

**Bun** handles bundling (transpiling TypeScript, bundling imports, processing CSS) but does NOT serve files directly. The build output goes to `dist/`.

**Hono** handles all HTTP concerns:
- API routes (`/api/maryland/*`)
- Static file serving from `dist/`
- URL redirects for clean routes

This avoids "magic" bundling at runtime (like `Bun.serve()` with HTML imports) and keeps the build output inspectable.

## File Structure

```
broadband_factsheet/
├── index.ts                 # Hono server entry point
├── db/
│   └── duckdb.ts           # DuckDB initialization and query helper
├── routes/
│   └── maryland.ts         # API endpoints for Maryland data
├── public/
│   ├── maryland.html       # Map page (source)
│   └── maryland-client.ts  # Map client code (source)
├── dist/                   # Built output (git-ignored)
│   ├── maryland.html
│   └── maryland-*.js
├── data/maryland/          # FCC CSV data files (~1.3GB)
└── docs/
    └── maryland.md         # This file
```

## Setup

### Dependencies

```bash
bun add duckdb leaflet h3-js
bun add -d @types/leaflet
```

### Build

```bash
# Build all HTML files in public/ to dist/
bun build ./public/*.html --outdir=dist

# Or use the npm script
bun run build
```

### Run

```bash
bun run index.ts

# Or with hot reload for development
bun run dev
```

Server starts at http://localhost:3000. DuckDB loads ~12.6M records on startup (takes ~10-15 seconds).

## Data Flow

```
CSV Files (1.3GB)
    ↓
DuckDB (in-memory)
    ↓
hex_summary table (pre-aggregated)
    ↓
API endpoints
    ↓
Leaflet map (30K hex polygons)
```

## DuckDB Configuration

### BigInt to Integer Casting

DuckDB returns `BigInt` for aggregate functions (`COUNT`, `MAX`, etc.). JavaScript's `JSON.stringify()` cannot serialize BigInt values, causing runtime errors:

```
TypeError: JSON.stringify cannot serialize BigInt
```

**Solution:** Cast aggregates to `INTEGER` in SQL:

```sql
-- Instead of:
SELECT COUNT(*) as count FROM table

-- Use:
SELECT CAST(COUNT(*) AS INTEGER) as count FROM table
```

This is applied in `db/duckdb.ts` when creating the `hex_summary` table:

```typescript
await runQuery(`
  CREATE TABLE hex_summary AS
  SELECT
    h3_res8_id,
    CAST(COUNT(DISTINCT provider_id) AS INTEGER) as provider_count,
    CAST(MAX(max_advertised_download_speed) AS INTEGER) as max_download,
    -- ... other casted fields
  FROM broadband
  GROUP BY h3_res8_id
`)
```

And in `routes/maryland.ts` for dynamic queries:

```typescript
const providers = await runQuery(`
  SELECT
    brand_name,
    CAST(technology AS INTEGER) as technology,
    CAST(COUNT(*) AS INTEGER) as locations
  FROM broadband
  WHERE h3_res8_id = '${h3Id}'
  GROUP BY ...
`)
```

### Alternative Approaches (Not Used)

1. **`@duckdb/node-api`**: Newer DuckDB package with `getRowsJson()` that auto-converts BigInt to strings
2. **JSON.stringify replacer**: `JSON.stringify(data, (k, v) => typeof v === 'bigint' ? Number(v) : v)`
3. **Patch BigInt.prototype**: `BigInt.prototype.toJSON = function() { return Number(this) }`

We chose SQL casting because it solves the problem at the source without runtime overhead or global mutations.

## API Endpoints

### GET /api/maryland/hexes

Returns all hex IDs with summary data for map coloring.

**Response:**
```json
[
  { "id": "882aa8d553fffff", "providers": 8, "maxSpeed": 2000, "techCount": 6 },
  { "id": "882aa84063fffff", "providers": 5, "maxSpeed": 1000, "techCount": 4 }
]
```

### GET /api/maryland/hex/:h3Id

Returns detailed data for a specific hex (called on hover).

**Response:**
```json
{
  "hexId": "882aa8d553fffff",
  "summary": {
    "providerCount": 8,
    "maxDownload": 2000,
    "maxUpload": 880,
    "techCount": 6,
    "technologies": [40, 50, 61, 70, 71],
    "locationCount": 6063,
    "hasLowLatency": true
  },
  "providers": [
    {
      "provider": "Xfinity",
      "tech": 40,
      "download": 2000,
      "upload": 250,
      "lowLatency": 1,
      "locations": 192
    }
  ]
}
```

## Frontend

### Hex Coloring (by max download speed)

| Speed | Color |
|-------|-------|
| 1 Gbps+ | Green (`#10b981`) |
| 100-999 Mbps | Blue (`#3b82f6`) |
| 25-99 Mbps | Orange (`#f59e0b`) |
| < 25 Mbps | Red (`#ef4444`) |

### Technology Codes

| Code | Technology |
|------|------------|
| 10 | Copper/DSL |
| 40 | Cable |
| 50 | Fiber |
| 60 | GSO Satellite |
| 61 | NGSO Satellite (Starlink) |
| 70 | Unlicensed Fixed Wireless |
| 71 | Licensed Fixed Wireless |
| 72 | LBR Fixed Wireless |

### Libraries

- **Leaflet 1.9.4**: Map rendering
- **h3-js 4.3.0**: H3 hexagon boundary calculations
- **Alpine.js**: Reactive sidebar
- **HTMX**: (available but not heavily used in this implementation)

All bundled via Bun, not loaded from CDN.

## Performance Notes

- **Startup**: ~10-15 seconds to load 12.6M CSV rows into DuckDB
- **Memory**: ~2-3GB RAM for data + aggregations
- **Hex rendering**: 30K polygons with Leaflet's canvas renderer
- **Hover debounce**: 150ms delay before fetching hex details

## Routes

| URL | Handler | Description |
|-----|---------|-------------|
| `/maryland` | Hono redirect | Redirects to `/maryland.html` |
| `/maryland.html` | serveStatic | Serves built HTML from `dist/` |
| `/api/maryland/hexes` | maryland.ts | Returns all hex summaries |
| `/api/maryland/hex/:h3Id` | maryland.ts | Returns hex detail |
| `/*` | serveStatic | Serves other static files from `dist/` |
