# Debug Log

## 2024-11-28: All Hex Scores Showing 100

### Symptom

After implementing the composite broadband quality score, every hex on the map displayed a score of 100 (deep green). The scoring function was supposed to differentiate areas based on download speed, upload speed, provider count, and technology diversity.

### Initial Implementation

```typescript
calculateScore(hex: HexData): number {
  const MAX_DOWNLOAD = 1000  // 1 Gbps
  const MAX_UPLOAD = 100     // 100 Mbps
  const IDEAL_PROVIDERS = 3
  const MAX_TECH_TYPES = 5

  const downScore = Math.log10(hex.maxDownload + 1) / Math.log10(MAX_DOWNLOAD + 1)
  const upScore = Math.log10(hex.maxUpload + 1) / Math.log10(MAX_UPLOAD + 1)
  const providerScore = Math.min(hex.providers / IDEAL_PROVIDERS, 1)
  const techScore = Math.min(hex.techCount / MAX_TECH_TYPES, 1)

  // Weighted geometric mean
  const score = Math.pow(downScore, 0.50) *
                Math.pow(upScore, 0.20) *
                Math.pow(providerScore, 0.20) *
                Math.pow(techScore, 0.10)

  return Math.round(score * 100)
}
```

### Hypothesis

Initial assumption was a bug in the formula or color mapping. Suspected issues:
1. Geometric mean calculation error
2. Color scale not mapping correctly
3. All data being clamped to max values

### Investigation

Ran a query to check actual data distribution:

```typescript
const stats = await runQuery(`
  SELECT
    MIN(max_download) as min_down,
    MAX(max_download) as max_down,
    AVG(max_download) as avg_down,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY max_download) as median_down,
    MIN(provider_count) as min_prov,
    MAX(provider_count) as max_prov,
    AVG(provider_count) as avg_prov
  FROM hex_summary
`)
```

### Root Cause Found

The query revealed Maryland has **exceptionally good broadband coverage**:

| Metric | Expected Range | Actual Maryland Data |
|--------|----------------|----------------------|
| Min Download | 0-25 Mbps | **150 Mbps** |
| Median Download | ~100 Mbps | **2,000 Mbps (2 Gbps)** |
| Max Download | ~1 Gbps | **550,000 Mbps (550 Gbps)** |
| Min Providers | 0-1 | **2** |
| Avg Providers | 1-2 | **6.5** |
| Min Tech Types | 1 | 1 |
| Avg Tech Types | 1-2 | **4.4** |

**The "bug" wasn't in the code—it was in the assumptions.**

The scoring formula assumed:
- Some areas would have <25 Mbps (there were none)
- Some areas would have 1 provider (minimum was 2)
- Ideal was 3 providers (average was 6.5)
- 1 Gbps was the ceiling (median was 2 Gbps)

Every hex in Maryland already exceeded the "ideal" thresholds, so everything scored near 100.

### Why This Happened

1. **FCC Broadband Data Quality**: The dataset represents advertised availability, not actual speeds. Multiple providers report coverage in most areas.

2. **Maryland is well-served**: As a densely populated East Coast state near DC, Maryland has above-average broadband infrastructure.

3. **Satellite coverage**: GSO and NGSO satellite providers (like Starlink) cover essentially everywhere, inflating provider counts.

4. **Absolute vs Relative Thinking**: The formula was designed with national/rural considerations in mind, but Maryland's floor is another state's ceiling.

### Solution

Switched from **absolute thresholds** to **percentile-based scoring**:

```typescript
// Before: Absolute threshold (broken for good data)
const downScore = Math.log10(hex.maxDownload + 1) / Math.log10(1000 + 1)

// After: Percentile-based (works for any distribution)
const downScore = this.percentileScore(hex.maxDownload, [
  { value: 150, score: 0 },     // min in dataset
  { value: 280, score: 10 },    // p10
  { value: 1000, score: 25 },   // p25
  { value: 2000, score: 50 },   // p50 (median)
  { value: 2048, score: 75 },   // p75
  { value: 10000, score: 90 },  // p90
  { value: 100000, score: 100 },
])
```

This makes the score a **relative ranking within the dataset** rather than an absolute quality judgment.

### Lessons Learned

1. **Always check the data distribution first** before designing scoring formulas. A `SELECT MIN, MAX, AVG, PERCENTILE` query would have revealed the issue immediately.

2. **Absolute thresholds are fragile**. They work for one context but break in another. Percentile-based scoring adapts to any distribution.

3. **"Good" data can look like a bug**. When everything looks the same, the instinct is to check for code errors. Sometimes the data is just homogeneous.

4. **Domain assumptions need validation**. The formula assumed "typical US broadband" but Maryland is atypical. Broadband quality varies enormously by state.

5. **Satellite changes everything**. Universal satellite coverage (Starlink, HughesNet, Viasat) means even rural areas show 3+ providers, skewing competition metrics.

### Related Changes

- Updated legend to say "Relative ranking within Maryland" instead of implying absolute quality
- Changed labels from "0 / 50 / 100" to "Lower / Median / Higher"
- Documented percentile breakpoints in methodology.md for reproducibility
- Added note about state-specific calibration for future multi-state support
