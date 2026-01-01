import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import maryland from './routes/maryland'
import { initDatabase, runQuery } from './db/duckdb'

const app = new Hono()

// API routes
app.route('/api/maryland', maryland)

// Clean URL routes (redirect to .html files)
app.get('/maryland', (c) => c.redirect('/maryland.html'))

// Health check endpoint
app.get('/health', async (c) => {
  try {
    await runQuery('SELECT 1')
    return c.json({
      status: 'ok',
      env: process.env.NODE_ENV || 'development',
    })
  } catch (e) {
    return c.json({
      status: 'error',
      message: e instanceof Error ? e.message : 'Unknown error',
    }, 500)
  }
})

// Static files from dist/
app.use('/*', serveStatic({ root: './dist' }))

// Initialize database before starting server
await initDatabase()

export default app
