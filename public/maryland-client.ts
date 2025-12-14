import Alpine from 'alpinejs'
import htmx from 'htmx.org'
import L from 'leaflet'
import * as h3 from 'h3-js'
import 'leaflet/dist/leaflet.css'

declare global {
  interface Window {
    htmx: typeof htmx
    Alpine: typeof Alpine
  }
}

window.htmx = htmx
window.Alpine = Alpine

const TECH_NAMES: Record<number, string> = {
  10: 'Copper/DSL',
  40: 'Cable',
  50: 'Fiber',
  60: 'GSO Satellite',
  61: 'NGSO Satellite',
  70: 'Unlicensed FW',
  71: 'Licensed FW',
  72: 'LBR FW',
}

interface HexData {
  id: string
  providers: number
  maxDownload: number
  maxUpload: number
  techCount: number
  score?: number
}

interface HexDetail {
  hexId: string
  summary: {
    providerCount: number
    maxDownload: number
    maxUpload: number
    techCount: number
    technologies: number[]
    locationCount: number
    hasLowLatency: boolean
  }
  providers: Array<{
    provider: string
    tech: number
    download: number
    upload: number
    lowLatency: number
    locations: number
  }>
}

// 10-step color scale from red (poor) to green (excellent)
const SCORE_COLORS = [
  '#dc2626', // 0-10:  Red (very poor)
  '#ea580c', // 10-20: Red-orange
  '#f97316', // 20-30: Orange
  '#fb923c', // 30-40: Light orange
  '#facc15', // 40-50: Yellow
  '#a3e635', // 50-60: Yellow-green
  '#4ade80', // 60-70: Light green
  '#22c55e', // 70-80: Green
  '#16a34a', // 80-90: Dark green
  '#15803d', // 90-100: Deep green
]

Alpine.data('marylandMap', () => ({
  map: null as L.Map | null,
  hexLayer: null as L.LayerGroup | null,
  hexPolygons: new Map<string, L.Polygon>(),
  hexDataMap: new Map<string, HexData>(),
  hexCount: 0,
  selectedHex: null as HexDetail | null,
  selectedPolygon: null as L.Polygon | null,
  loading: true,

  async init() {
    // Initialize Leaflet map centered on Maryland
    this.map = L.map('map', {
      preferCanvas: true, // Better performance for many polygons
    }).setView([39.0458, -76.6413], 8)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map)

    this.hexLayer = L.layerGroup().addTo(this.map)

    await this.loadHexes()
  },

  async loadHexes() {
    this.loading = true
    try {
      const response = await fetch('/api/maryland/hexes')
      const hexes: HexData[] = await response.json()

      this.hexCount = hexes.length
      console.log(`Loaded ${hexes.length} hexes`)

      for (const hex of hexes) {
        // Calculate composite score for each hex
        hex.score = this.calculateScore(hex)
        this.hexDataMap.set(hex.id, hex)
        this.renderHex(hex)
      }
    } catch (error) {
      console.error('Failed to load hexes:', error)
    } finally {
      this.loading = false
    }
  },

  // Composite scoring using percentile-based normalization
  // Calibrated to actual Maryland data distribution for meaningful differentiation
  calculateScore(hex: HexData): number {
    // Maryland-specific percentiles (from data analysis)
    // Download: p10=280, p50=2000, p90=10000
    // Upload: p10=30, p50=880, p90=10000
    // Providers: p10=5, p50=7, p90=8
    // Tech: min=1, max=7, avg=4.4

    // Percentile-based scoring using linear interpolation
    const downScore = this.percentileScore(hex.maxDownload, [
      { value: 150, score: 0 },    // min in dataset
      { value: 280, score: 10 },   // p10
      { value: 1000, score: 25 },  // p25
      { value: 2000, score: 50 },  // p50 (median)
      { value: 2048, score: 75 },  // p75
      { value: 10000, score: 90 }, // p90
      { value: 100000, score: 100 }, // near max
    ])

    const upScore = this.percentileScore(hex.maxUpload, [
      { value: 5, score: 0 },      // min
      { value: 30, score: 10 },    // p10
      { value: 100, score: 25 },
      { value: 880, score: 50 },   // p50
      { value: 2000, score: 75 },
      { value: 10000, score: 90 }, // p90
      { value: 100000, score: 100 },
    ])

    const providerScore = this.percentileScore(hex.providers, [
      { value: 2, score: 0 },   // min
      { value: 4, score: 20 },
      { value: 5, score: 35 },  // p10
      { value: 6, score: 50 },
      { value: 7, score: 70 },  // p50
      { value: 8, score: 85 },  // p90
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

    // Weighted average (arithmetic mean for interpretability)
    const weights = {
      download: 0.45,
      upload: 0.20,
      providers: 0.25,
      technology: 0.10,
    }

    const score =
      downScore * weights.download +
      upScore * weights.upload +
      providerScore * weights.providers +
      techScore * weights.technology

    return Math.round(score)
  },

  // Linear interpolation between percentile breakpoints
  percentileScore(value: number, breakpoints: Array<{ value: number; score: number }>): number {
    if (value <= breakpoints[0].value) return breakpoints[0].score
    if (value >= breakpoints[breakpoints.length - 1].value) return breakpoints[breakpoints.length - 1].score

    for (let i = 1; i < breakpoints.length; i++) {
      if (value <= breakpoints[i].value) {
        const prev = breakpoints[i - 1]
        const curr = breakpoints[i]
        const ratio = (value - prev.value) / (curr.value - prev.value)
        return prev.score + ratio * (curr.score - prev.score)
      }
    }
    return breakpoints[breakpoints.length - 1].score
  },

  renderHex(hex: HexData) {
    try {
      const boundary = h3.cellToBoundary(hex.id)
      const latLngs: L.LatLngTuple[] = boundary.map(([lat, lng]) => [lat, lng])

      const polygon = L.polygon(latLngs, {
        color: '#374151',
        weight: 0.5,
        fillColor: this.getScoreColor(hex.score ?? 0),
        fillOpacity: 0.7,
      })

      polygon.on('click', () => this.onHexClick(hex.id, polygon))

      polygon.addTo(this.hexLayer!)
      this.hexPolygons.set(hex.id, polygon)
    } catch (error) {
      // Skip invalid hex IDs
      console.warn(`Invalid hex ID: ${hex.id}`)
    }
  },

  getScoreColor(score: number): string {
    // Map score (0-100) to color index (0-9)
    const index = Math.min(Math.floor(score / 10), 9)
    return SCORE_COLORS[index]
  },

  async onHexClick(hexId: string, polygon: L.Polygon) {
    // Reset previous selected polygon
    if (this.selectedPolygon && this.selectedPolygon !== polygon) {
      this.selectedPolygon.setStyle({
        weight: 0.5,
        color: '#374151',
      })
    }

    // Highlight current polygon
    polygon.setStyle({
      weight: 2,
      color: '#1f2937',
    })
    this.selectedPolygon = polygon

    // Fetch hex details
    try {
      const response = await fetch(`/api/maryland/hex/${hexId}`)
      if (response.ok) {
        this.selectedHex = await response.json()
      }
    } catch (error) {
      console.error('Failed to fetch hex details:', error)
    }
  },

  formatSpeed(speed: number): string {
    if (speed >= 1000) {
      return `${(speed / 1000).toFixed(1)} Gbps`
    }
    return `${speed} Mbps`
  },

  speedClass(download: number): string {
    if (download >= 1000) return 'speed-gigabit'
    if (download >= 100) return 'speed-fast'
    if (download >= 25) return 'speed-moderate'
    return 'speed-slow'
  },

  techName(code: number): string {
    return TECH_NAMES[code] || `Tech ${code}`
  },

  getHexScore(hexId: string): number {
    const hexData = this.hexDataMap.get(hexId)
    return hexData?.score ?? 0
  },

  getScoreColor(score: number): string {
    const index = Math.min(Math.floor(score / 10), 9)
    return SCORE_COLORS[index]
  },
}))

Alpine.start()
