import * as duckdb from 'duckdb'

let db: duckdb.Database
let conn: duckdb.Connection

const DB_PATH = process.env.DB_PATH || './data/broadband.duckdb'
const LOCAL_DB_PATH = './data/broadband.duckdb'

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

  let dbPath = DB_PATH

  // If DB_PATH is a URL, download it first
  if (DB_PATH.startsWith('http')) {
    const localFile = Bun.file(LOCAL_DB_PATH)
    if (!(await localFile.exists())) {
      console.log(`Downloading database from ${DB_PATH}...`)
      const response = await fetch(DB_PATH)
      if (!response.ok) {
        throw new Error(`Failed to download database: ${response.status} ${response.statusText}`)
      }
      await Bun.write(LOCAL_DB_PATH, response)
      console.log('Database downloaded successfully')
    }
    dbPath = LOCAL_DB_PATH
  }

  db = new duckdb.Database(dbPath)
  conn = db.connect()

  // Check if database already has data (pre-built)
  const tables = await runQuery<{ table_name: string }>(`
    SELECT table_name FROM duckdb_tables() WHERE table_name = 'broadband'
  `)

  if (tables.length > 0) {
    console.log('Using pre-built database')
    const hexCount = await runQuery<{ count: number }>('SELECT COUNT(*) as count FROM hex_summary')
    const rowCount = await runQuery<{ count: number }>('SELECT COUNT(*) as count FROM broadband')
    console.log(`DuckDB ready: ${rowCount[0].count.toLocaleString()} records, ${hexCount[0].count.toLocaleString()} unique hexes`)
    return
  }

  // Otherwise, build from CSVs (fallback / local dev)
  console.log('Building database from CSV files...')
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
