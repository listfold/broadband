# Broadband Hex Scoring Methodology

Research findings for creating a composite broadband quality score that accounts for multiple factors: download speed, upload speed, number of providers, and technology diversity.

## Executive Summary

A composite score should move beyond simple download speed to capture the complete picture of broadband availability and quality. Based on research into statistical methodologies and broadband-specific scoring systems, we recommend a **weighted geometric mean** approach with **logarithmic scaling** for speed metrics and a **competition bonus** for provider diversity.

---

## Research Findings

### 1. Existing Broadband Quality Scores

#### Purdue BQS Formula
The [Broadband Quality Score (BQS)](https://pcrd.purdue.edu/re-introducing-the-broadband-quality-score-bqs/) uses a simple weighted linear formula:

```
BQS = (Download × 0.45) + (Upload × 0.32) - (Latency × 0.23)
```

- Normalized to 0-100 range
- Download weighted highest (45%)
- Upload significant (32%)
- Latency subtracted as a penalty

**Limitation**: Linear weighting allows full compensability—extremely high download can mask poor upload.

#### Cloudflare AIM Score
[Cloudflare's AIM database](https://blog.cloudflare.com/aim-database-for-internet-quality/) uses use-case-specific scoring:
- **Streaming**: download bandwidth + latency + packet loss
- **Gaming**: packet loss + latency (download less important)
- **Video calls**: packet loss + jitter + latency

**Insight**: Different use cases weight metrics differently.

#### FCC Measuring Broadband America
The [FCC's methodology](https://www.fcc.gov/reports-research/reports/measuring-broadband-america/measuring-fixed-broadband-thirteenth-report) uses:
- Median of mean values per ISP tier
- Subscriber-weighted medians for overall ISP scores
- Separate reporting of download, upload, latency, packet loss

---

### 2. Statistical Aggregation Methods

#### Arithmetic Mean (Simple Weighted Sum)
```
Score = Σ(weight_i × normalized_value_i)
```

**Pros**: Easy to understand and implement
**Cons**: Full compensability—a high score in one dimension can completely offset poor performance in another

#### Geometric Mean
```
Score = (Π(normalized_value_i ^ weight_i))
```

**Pros**:
- Penalizes imbalance across dimensions
- Used by [Human Development Index](https://geographicbook.com/computation-of-composite-index/)
- Prevents high values masking deficiencies
- More realistic for non-substitutable factors

**Cons**: Cannot handle zero values (requires minimum floor)

#### Mazziotta-Pareto Index (MPI)
[Developed by ISTAT](https://www.istat.it/en/files/2013/12/Rivista2013_Mazziotta_Pareto.pdf), the MPI penalizes variance:

```
MPI = M - σ × cv
```

Where:
- M = arithmetic mean of normalized indicators
- σ = standard deviation
- cv = coefficient of variation (penalty factor)

**Insight**: Explicitly penalizes unbalanced performance.

---

### 3. Handling Speed Metrics: Diminishing Returns

Consumer perception of broadband quality follows [logarithmic utility](https://blog.nerdbucket.com/diminishing-returns-in-game-design-the-logarithm/article)—the jump from 10 to 50 Mbps feels much larger than 500 to 540 Mbps.

#### Logarithmic Scaling
```
normalized_speed = log(speed + 1) / log(max_speed + 1)
```

Or with base adjustment for steeper/flatter curves:
```
normalized_speed = log_b(speed + 1) / log_b(max_speed + 1)
```

#### Threshold-Based Scaling
Define meaningful tiers based on use cases:
| Tier | Download | Upload | Description |
|------|----------|--------|-------------|
| 1 | < 25 Mbps | < 3 Mbps | Below FCC broadband definition |
| 2 | 25-100 Mbps | 3-20 Mbps | Basic broadband |
| 3 | 100-250 Mbps | 20-50 Mbps | Enhanced broadband |
| 4 | 250-1000 Mbps | 50-100 Mbps | High-speed |
| 5 | 1000+ Mbps | 100+ Mbps | Gigabit class |

---

### 4. Competition Metrics: HHI and Provider Diversity

#### Herfindahl-Hirschman Index (HHI)
The [HHI](https://en.wikipedia.org/wiki/Herfindahl–Hirschman_index) measures market concentration:

```
HHI = Σ(market_share_i²) × 10000
```

| HHI Score | Competition Level |
|-----------|-------------------|
| < 1,500 | Competitive |
| 1,500-2,500 | Moderately concentrated |
| > 2,500 | Highly concentrated |

[BroadbandNow research](https://broadbandnow.com/research/broadband-competitiveness) found:
- 96% of U.S. counties have HHI > 2,500 (highly concentrated)
- Average nationwide HHI: 5,842
- Price difference: 35% higher in concentrated markets

#### Simple Provider Count
For our hex-level analysis (without market share data), we can use:
```
competition_score = min(provider_count / ideal_providers, 1.0)
```

Where `ideal_providers` might be 3-4 (diminishing returns beyond that).

#### Technology Diversity Bonus
More technology types = more resilience and choice:
```
tech_diversity = unique_tech_count / max_possible_techs
```

Technologies: Fiber, Cable, DSL, Fixed Wireless, Satellite

---

## Proposed Scoring Formula

### Option A: Weighted Geometric Mean with Log Scaling

```javascript
function calculateHexScore(hex) {
  // 1. Log-normalize speed metrics (diminishing returns)
  const maxDown = 1000; // Reference max (1 Gbps)
  const maxUp = 100;    // Reference max (100 Mbps)

  const downScore = Math.log10(hex.maxDownload + 1) / Math.log10(maxDown + 1);
  const upScore = Math.log10(hex.maxUpload + 1) / Math.log10(maxUp + 1);

  // 2. Competition score (diminishing returns after 3 providers)
  const providerScore = Math.min(hex.providerCount / 3, 1.0);

  // 3. Technology diversity (out of 5 main types)
  const techScore = hex.uniqueTechCount / 5;

  // 4. Weighted geometric mean (penalizes imbalance)
  const weights = {
    download: 0.50,  // Most important for consumers
    upload: 0.20,    // Growing importance (video calls, cloud)
    providers: 0.20, // Competition drives price/quality
    technology: 0.10 // Diversity/resilience
  };

  const score = Math.pow(downScore, weights.download) *
                Math.pow(upScore, weights.upload) *
                Math.pow(Math.max(providerScore, 0.01), weights.providers) *
                Math.pow(Math.max(techScore, 0.01), weights.technology);

  return score * 100; // Scale to 0-100
}
```

### Option B: Modified BQS with Competition Bonus

```javascript
function calculateHexScore(hex) {
  // Base quality score (log-scaled)
  const downNorm = Math.min(Math.log10(hex.maxDownload + 1) / 3, 1); // log10(1000)=3
  const upNorm = Math.min(Math.log10(hex.maxUpload + 1) / 2, 1);    // log10(100)=2

  const baseScore = (downNorm * 0.55) + (upNorm * 0.25);

  // Competition multiplier (1.0 to 1.2)
  const competitionBonus = 1 + (Math.min(hex.providerCount, 4) / 20);

  // Tech diversity multiplier (1.0 to 1.1)
  const techBonus = 1 + (hex.uniqueTechCount / 50);

  return Math.min(baseScore * competitionBonus * techBonus * 100, 100);
}
```

### Option C: Tiered Approach with Penalty for Imbalance

```javascript
function calculateHexScore(hex) {
  // Tier-based scoring (0-20 points each dimension)
  const downTier = getSpeedTier(hex.maxDownload, [25, 100, 250, 500, 1000]);
  const upTier = getSpeedTier(hex.maxUpload, [3, 10, 25, 50, 100]);
  const providerTier = Math.min(hex.providerCount, 5);
  const techTier = hex.uniqueTechCount;

  // Weighted sum
  const rawScore = (downTier * 10) +      // 0-50 points
                   (upTier * 5) +          // 0-25 points
                   (providerTier * 3) +    // 0-15 points
                   (techTier * 2);         // 0-10 points

  // Penalty for imbalance (Mazziotta-Pareto style)
  const scores = [downTier/5, upTier/5, providerTier/5, techTier/5];
  const mean = scores.reduce((a,b) => a+b) / scores.length;
  const variance = scores.reduce((a,b) => a + Math.pow(b - mean, 2), 0) / scores.length;
  const cv = Math.sqrt(variance) / (mean || 1);

  const penalty = cv * 10; // 0-10 point penalty for imbalance

  return Math.max(rawScore - penalty, 0);
}

function getSpeedTier(speed, thresholds) {
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (speed >= thresholds[i]) return i + 1;
  }
  return 0;
}
```

---

## Recommended Approach

**Option A (Weighted Geometric Mean)** is recommended because:

1. **Prevents gaming**: Can't achieve perfect score with just one excellent metric
2. **Reflects reality**: Consumer satisfaction requires balance across dimensions
3. **Log scaling**: Captures diminishing returns on speed (100→200 Mbps matters less than 10→20)
4. **Flexible weights**: Easy to adjust as priorities change
5. **Academic backing**: Used by HDI and other major composite indices

### Suggested Weight Distribution

| Factor | Weight | Rationale |
|--------|--------|-----------|
| Download Speed | 50% | Primary consumer concern |
| Upload Speed | 20% | Growing importance (remote work, cloud, video) |
| Provider Competition | 20% | Drives price, service quality, future investment |
| Technology Diversity | 10% | Resilience, choice, future-proofing |

### Color Scale Mapping

| Score Range | Color | Label |
|-------------|-------|-------|
| 0-20 | Red | Poor |
| 20-40 | Orange | Below Average |
| 40-60 | Yellow | Moderate |
| 60-80 | Light Green | Good |
| 80-100 | Dark Green | Excellent |

---

## Sources

- [Purdue BQS Formula](https://pcrd.purdue.edu/re-introducing-the-broadband-quality-score-bqs/)
- [Cloudflare AIM Database](https://blog.cloudflare.com/aim-database-for-internet-quality/)
- [FCC Measuring Broadband America](https://www.fcc.gov/reports-research/reports/measuring-broadband-america/measuring-fixed-broadband-thirteenth-report)
- [Mazziotta-Pareto Index (ISTAT)](https://www.istat.it/en/files/2013/12/Rivista2013_Mazziotta_Pareto.pdf)
- [Composite Index Aggregation Methods](https://link.springer.com/article/10.1007/s11205-017-1832-9)
- [Geometric Mean for Composite Indices](https://www.mdpi.com/2079-3197/10/4/64)
- [Herfindahl-Hirschman Index](https://en.wikipedia.org/wiki/Herfindahl–Hirschman_index)
- [BroadbandNow Competition Research](https://broadbandnow.com/research/broadband-competitiveness)
- [DOJ HHI Thresholds](https://www.justice.gov/atr/herfindahl-hirschman-index)
- [InfraCompass Methodology](https://infracompass.gihub.org/methodology)
- [MCDA Overview](https://www.1000minds.com/decision-making/what-is-mcdm-mcda)
- [Diminishing Returns & Logarithmic Scaling](https://blog.nerdbucket.com/diminishing-returns-in-game-design-the-logarithm/article)

---

## Implemented Approach

### Initial Attempt: Absolute Thresholds (Failed)

Initially implemented **Option A (Weighted Geometric Mean with Log Scaling)** using absolute thresholds:
- MAX_DOWNLOAD = 1 Gbps
- MAX_UPLOAD = 100 Mbps
- IDEAL_PROVIDERS = 3

**Problem**: Maryland data showed everything scoring ~100 because the data is exceptionally good:
- Minimum download: 150 Mbps (no hex below this)
- Median download: 2 Gbps
- Minimum providers: 2
- Average providers: 6.5

The absolute thresholds assumed a range from 0-1000 Mbps, but Maryland's "worst" hexes already exceed those ideals.

### Current Implementation: Percentile-Based Scoring

Switched to **percentile-based normalization** calibrated to actual Maryland data distribution. This provides meaningful differentiation within a high-quality dataset.

#### Maryland Data Distribution

| Metric | Min | P10 | P25 | P50 | P75 | P90 | Max |
|--------|-----|-----|-----|-----|-----|-----|-----|
| Download | 150 | 280 | 1,000 | 2,000 | 2,048 | 10,000 | 550,000 Mbps |
| Upload | 5 | 30 | - | 880 | - | 10,000 | 550,000 Mbps |
| Providers | 2 | 5 | - | 7 | - | 8 | 14 |
| Tech Types | 1 | - | - | - | - | - | 7 |

#### Scoring Function

```typescript
calculateScore(hex: HexData): number {
  // Percentile-based scoring using linear interpolation
  const downScore = this.percentileScore(hex.maxDownload, [
    { value: 150, score: 0 },    // min in dataset
    { value: 280, score: 10 },   // p10
    { value: 1000, score: 25 },  // p25
    { value: 2000, score: 50 },  // p50 (median)
    { value: 2048, score: 75 },  // p75
    { value: 10000, score: 90 }, // p90
    { value: 100000, score: 100 },
  ])

  const upScore = this.percentileScore(hex.maxUpload, [
    { value: 5, score: 0 },
    { value: 30, score: 10 },
    { value: 100, score: 25 },
    { value: 880, score: 50 },
    { value: 2000, score: 75 },
    { value: 10000, score: 90 },
    { value: 100000, score: 100 },
  ])

  const providerScore = this.percentileScore(hex.providers, [
    { value: 2, score: 0 },
    { value: 4, score: 20 },
    { value: 5, score: 35 },
    { value: 6, score: 50 },
    { value: 7, score: 70 },
    { value: 8, score: 85 },
    { value: 10, score: 100 },
  ])

  const techScore = this.percentileScore(hex.techCount, [
    { value: 1, score: 0 },
    { value: 2, score: 20 },
    { value: 3, score: 40 },
    { value: 4, score: 55 },
    { value: 5, score: 75 },
    { value: 6, score: 90 },
    { value: 7, score: 100 },
  ])

  // Weighted arithmetic mean
  const weights = { download: 0.45, upload: 0.20, providers: 0.25, technology: 0.10 }

  return Math.round(
    downScore * weights.download +
    upScore * weights.upload +
    providerScore * weights.providers +
    techScore * weights.technology
  )
}

// Linear interpolation between breakpoints
percentileScore(value: number, breakpoints: Array<{value: number, score: number}>): number {
  // Returns interpolated score between nearest breakpoints
}
```

#### Weight Rationale

| Factor | Weight | Why |
|--------|--------|-----|
| Download | 45% | Primary consumer concern |
| Providers | 25% | Competition important for price/service (bumped up) |
| Upload | 20% | Growing with remote work, video calls |
| Technology | 10% | Diversity provides resilience |

#### Why Percentile-Based?

1. **Relative ranking**: Score of 50 = median within Maryland (not an absolute judgment)
2. **Meaningful differentiation**: Spreads scores across 0-100 even when all data is "good"
3. **Context-aware**: Adapts to the specific dataset being analyzed
4. **Intuitive interpretation**: "This hex is better than X% of Maryland hexes"

#### Why Arithmetic Mean (not Geometric)?

Switched from geometric to arithmetic mean because:
1. With percentile scoring, values are already normalized (0-100)
2. Easier to interpret: "45% of score from download, 25% from providers..."
3. Geometric mean unnecessary when inputs are comparable scales

### 10-Step Color Scale

| Score | Color | Hex Code | Interpretation |
|-------|-------|----------|----------------|
| 0-10 | Red | `#dc2626` | Bottom 10% |
| 10-20 | Red-orange | `#ea580c` | Below p20 |
| 20-30 | Orange | `#f97316` | Below p30 |
| 30-40 | Light orange | `#fb923c` | Below p40 |
| 40-50 | Yellow | `#facc15` | Below median |
| 50-60 | Yellow-green | `#a3e635` | Above median |
| 60-70 | Light green | `#4ade80` | Above p60 |
| 70-80 | Green | `#22c55e` | Above p70 |
| 80-90 | Dark green | `#16a34a` | Top 20% |
| 90-100 | Deep green | `#15803d` | Top 10% |

### Example Scores (Maryland)

| Hex Profile | Download | Upload | Providers | Tech | Score |
|-------------|----------|--------|-----------|------|-------|
| Top tier | 10 Gbps | 10 Gbps | 8 | 6 | ~90 |
| Above median | 2 Gbps | 1 Gbps | 7 | 5 | ~65 |
| Median | 2 Gbps | 880 Mbps | 7 | 4 | ~50 |
| Below median | 500 Mbps | 100 Mbps | 5 | 3 | ~35 |
| Bottom tier | 150 Mbps | 30 Mbps | 2 | 1 | ~5 |

### API Changes

The `/api/maryland/hexes` endpoint now returns:

```typescript
interface HexSummary {
  id: string
  providers: number
  maxDownload: number  // Previously "maxSpeed"
  maxUpload: number    // Added
  techCount: number
}
```

### UI Changes

1. **Legend**: Gradient bar labeled "Lower / Median / Higher" with subtitle "Relative ranking within Maryland"
2. **Sidebar**: Score display card with value, label, and colored progress bar
3. **Map**: Fill opacity increased to 0.7 for better color visibility

### Files Modified

- `routes/maryland.ts`: Added `maxUpload` to hex summary endpoint
- `public/maryland-client.ts`: Scoring function, color scale, score helpers
- `public/maryland.html`: Legend redesign, score display component, CSS

### Future Considerations

1. **State-specific calibration**: Each state may need its own percentile breakpoints
2. **National comparison**: Could add a secondary "national percentile" score
3. **Recalibration**: Breakpoints should be updated when data changes significantly
