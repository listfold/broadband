/**
 * Script to build broadband.duckdb from CSV files
 * Run with: bun scripts/build-db.ts
 */
import { initDatabase } from '../db/duckdb'
import { unlink } from 'node:fs/promises'

const DB_PATH = './data/broadband.duckdb'

async function main() {
  console.log('Building DuckDB database...')

  // Delete existing DB file if present for clean rebuild
  const dbFile = Bun.file(DB_PATH)
  if (await dbFile.exists()) {
    console.log('Removing existing database file...')
    await unlink(DB_PATH)
  }

  // Build database from CSVs
  await initDatabase()

  // Verify the file was created
  const newFile = Bun.file(DB_PATH)
  if (await newFile.exists()) {
    const stats = await newFile.stat()
    console.log(`Database built successfully: ${(stats.size / 1024 / 1024).toFixed(2)} MB`)
  } else {
    console.error('ERROR: Database file was not created')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Build failed:', err)
  process.exit(1)
})
