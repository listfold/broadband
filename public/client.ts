import htmx from 'htmx.org'
import Alpine from 'alpinejs'

declare global {
  interface Window {
    htmx: typeof htmx
    Alpine: typeof Alpine
  }
}

window.htmx = htmx
window.Alpine = Alpine
Alpine.start()
