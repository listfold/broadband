import { Hono } from 'hono'
import { runQuery } from '../db/duckdb'

const maryland = new Hono()

interface HexSummary {
  id: string
  providers: number
  maxDownload: number
  maxUpload: number
  techCount: number
}

interface HexDetail {
  h3_res8_id: string
  provider_count: number
  brand_count: number
  max_download: number
  max_upload: number
  tech_count: number
  technologies: number[]
  location_count: number
  has_low_latency: boolean
}

interface ProviderDetail {
  provider: string
  tech: number
  download: number
  upload: number
  lowLatency: number
  locations: number
}

// GET /api/maryland/hexes - Return all hex IDs with summary for coloring
maryland.get('/hexes', async (c) => {
  const rows = await runQuery<{
    h3_res8_id: string
    provider_count: number
    max_download: number
    max_upload: number
    tech_count: number
  }>(`
    SELECT
      h3_res8_id,
      provider_count,
      max_download,
      max_upload,
      tech_count
    FROM hex_summary
  `)

  const result: HexSummary[] = rows.map((row) => ({
    id: row.h3_res8_id,
    providers: row.provider_count,
    maxDownload: row.max_download,
    maxUpload: row.max_upload,
    techCount: row.tech_count,
  }))

  return c.json(result)
})

// GET /api/maryland/hex/:h3Id - Detailed data for a single hex
maryland.get('/hex/:h3Id', async (c) => {
  const h3Id = c.req.param('h3Id')

  // Validate h3Id format (basic validation - hex string)
  if (!/^[0-9a-f]+$/i.test(h3Id)) {
    return c.json({ error: 'Invalid hex ID format' }, 400)
  }

  const summary = await runQuery<HexDetail>(`
    SELECT * FROM hex_summary WHERE h3_res8_id = '${h3Id}'
  `)

  if (!summary[0]) {
    return c.json({ error: 'Hex not found' }, 404)
  }

  const providers = await runQuery<{
    brand_name: string
    technology: number
    max_advertised_download_speed: number
    max_advertised_upload_speed: number
    low_latency: number
    locations: number
  }>(`
    SELECT
      brand_name,
      CAST(technology AS INTEGER) as technology,
      CAST(max_advertised_download_speed AS INTEGER) as max_advertised_download_speed,
      CAST(max_advertised_upload_speed AS INTEGER) as max_advertised_upload_speed,
      CAST(low_latency AS INTEGER) as low_latency,
      CAST(COUNT(*) AS INTEGER) as locations
    FROM broadband
    WHERE h3_res8_id = '${h3Id}'
    GROUP BY brand_name, technology, max_advertised_download_speed,
             max_advertised_upload_speed, low_latency
    ORDER BY max_advertised_download_speed DESC
  `)

  const providerDetails: ProviderDetail[] = providers.map((p) => ({
    provider: p.brand_name,
    tech: p.technology,
    download: p.max_advertised_download_speed,
    upload: p.max_advertised_upload_speed,
    lowLatency: p.low_latency,
    locations: p.locations,
  }))

  return c.json({
    hexId: h3Id,
    summary: {
      providerCount: summary[0].provider_count,
      maxDownload: summary[0].max_download,
      maxUpload: summary[0].max_upload,
      techCount: summary[0].tech_count,
      technologies: summary[0].technologies,
      locationCount: summary[0].location_count,
      hasLowLatency: summary[0].has_low_latency,
    },
    providers: providerDetails,
  })
})

export default maryland
