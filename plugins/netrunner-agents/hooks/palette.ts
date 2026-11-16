// The pane's colours. scripts/audit.mjs checks every TEXT colour here against every SURFACE:
// at least 4.5:1 (WCAG 2.2 AA), most of them way past 7:1 (AAA).

export const SURFACE = {
  pane: '#0B0B12',
  tile: '#12121C',
}

/** Dark backgrounds the app itself may paint behind the pane (Claude Code dark, and the cyberpunk themes). */
export const HOST_SURFACES = ['#1E1B30', '#262624', '#1F1E1D', '#0E0E10']

export const TEXT = {
  ink: '#E8E8F0', // names
  soft: '#B8B8CC', // finished names, the current tool line
  dim: '#A6A6C2', // tool lines, numbers
  muted: '#8C8CAE', // labels, older activity, times
  yellow: '#F3E600', // the // AGENTS header
  cyan: '#00F0FF', // totals, the activity button
  red: '#FF5C8A', // "flatlined" (always with the word, never colour alone)
}

/** Tile borders. Decoration only, not text. */
export const EDGE = '#2A2A40'
