import * as duckdb from 'duckdb'

let db: duckdb.Database
let conn: duckdb.Connection

const FIXED_BROADBAND_FILES = [
  'bdc_24_Cable_fixed_broadband_J25_22nov2025.csv',
  'bdc_24_Copper_fixed_broadband_J25_22nov2025.csv',
  'bdc_24_FibertothePremises_fixed_broadband_J25_22nov2025.csv',
  'bdc_24_GSOSatellite_fixed_broadband_J25_22nov2025.csv',
  'bdc_24_NGSOSatellite_fixed_broadband_J25_22nov2025.csv',
  'bdc_24_LBRFixedWireless_fixed_broadband_J25_22nov2025.csv',
  'bdc_24_LicensedFixedWireless_fixed_broadband_J25_22nov2025.csv',
  'bdc_24_UnlicensedFixedWireless_fixed_broadband_J25_22nov2025.csv',
]

export function runQuery<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    conn.all(sql, (err, rows) => {
      if (err) reject(err)
      else resolve(rows as T[])
    })
  })
}

export async function initDatabase(): Promise<void> {
  console.log('Initializing DuckDB...')

  db = new duckdb.Database(':memory:')
  conn = db.connect()

  const dataDir = './data/maryland'

  // Create table from first file
  console.log(`Loading ${FIXED_BROADBAND_FILES[0]}...`)
  await runQuery(`
    CREATE TABLE broadband AS
    SELECT * FROM read_csv_auto('${dataDir}/${FIXED_BROADBAND_FILES[0]}')
  `)

  // Append remaining files
  for (const file of FIXED_BROADBAND_FILES.slice(1)) {
    console.log(`Loading ${file}...`)
    await runQuery(`
      INSERT INTO broadband
      SELECT * FROM read_csv_auto('${dataDir}/${file}')
    `)
  }

  console.log('Creating hex_summary aggregation table...')

  // Create aggregated hex summary table for fast lookups
  // Use CAST to INTEGER to avoid BigInt serialization issues with JSON
  await runQuery(`
    CREATE TABLE hex_summary AS
    SELECT
      h3_res8_id,
      CAST(COUNT(DISTINCT provider_id) AS INTEGER) as provider_count,
      CAST(COUNT(DISTINCT brand_name) AS INTEGER) as brand_count,
      CAST(MAX(max_advertised_download_speed) AS INTEGER) as max_download,
      CAST(MAX(max_advertised_upload_speed) AS INTEGER) as max_upload,
      CAST(COUNT(DISTINCT technology) AS INTEGER) as tech_count,
      LIST(DISTINCT CAST(technology AS INTEGER)) as technologies,
      CAST(COUNT(*) AS INTEGER) as location_count,
      BOOL_OR(low_latency = 1) as has_low_latency
    FROM broadband
    GROUP BY h3_res8_id
  `)

  // Create indexes for fast lookups
  await runQuery(`CREATE INDEX idx_hex ON hex_summary(h3_res8_id)`)
  await runQuery(`CREATE INDEX idx_broadband_hex ON broadband(h3_res8_id)`)

  const hexCount = await runQuery<{ count: number }>('SELECT COUNT(*) as count FROM hex_summary')
  const rowCount = await runQuery<{ count: number }>('SELECT COUNT(*) as count FROM broadband')

  console.log(`DuckDB initialized: ${rowCount[0].count.toLocaleString()} records, ${hexCount[0].count.toLocaleString()} unique hexes`)
}

export function getConnection(): duckdb.Connection {
  return conn
}
