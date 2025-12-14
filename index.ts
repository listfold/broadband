import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import maryland from './routes/maryland'
import { initDatabase } from './db/duckdb'

const app = new Hono()

// API routes
app.route('/api/maryland', maryland)

// Clean URL routes (redirect to .html files)
app.get('/maryland', (c) => c.redirect('/maryland.html'))

// Static files from dist/
app.use('/*', serveStatic({ root: './dist' }))

// Initialize database before starting server
await initDatabase()

export default app
