// netrunner-agents: the landing page script.
// - copy buttons for the install lines
// - the live demo: pretend agents in a pane laid out like the real one
// - the styler: try any mascot, colour and cosmetic, get the /netrunner command
//
// The mascots are drawn by mascots.js, which is the mod's own mascots.ts with its types stripped.
// All text goes in with textContent (never innerHTML), and the demo pauses whenever it's off
// screen, the tab is hidden, or you've asked your system to reduce motion.

import { COLORS, COSMETICS, MASCOTS, SIGNATURE, lookFor, mascotSvg } from './mascots.js'

const $ = (sel, root = document) => root.querySelector(sel)
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]

const el = (tag, cls, text) => {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  if (text !== undefined) node.textContent = text
  return node
}

const pictures = new Map()
const picture = (look, phase) => {
  const key = `${look.mascot}|${look.color}|${look.cosmetic}|${phase}`
  if (!pictures.has(key)) pictures.set(key, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(mascotSvg(look, phase))}`)
  return pictures.get(key)
}
const mascotImg = (look, phase, cls, label) => {
  const img = el('img', cls)
  img.src = picture(look, phase)
  img.alt = label
  img.width = 64
  img.height = 48
  return img
}

// ---------------------------------------------------------------- copy buttons
for (const box of $$('[data-copy-box]')) {
  const button = $('[data-copy]', box)
  const text = $('.cmd__text', box)
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text.textContent.trim())
      button.textContent = 'Copied'
      button.classList.add('is-done')
    } catch {
      getSelection().selectAllChildren(text)
      button.textContent = 'Selected'
    }
    setTimeout(() => {
      button.textContent = 'Copy'
      button.classList.remove('is-done')
    }, 1600)
  })
}

// ---------------------------------------------------------------- the live demo
const pane = $('[data-pane]')
const toggle = $('[data-demo-toggle]')
const restart = $('[data-demo-restart]')
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)')

const TICK = 900 // ms per step, about the real pane's pace once batching is counted
const LOOP = 36 // steps before it starts over
const SCRIPT = [
  {
    id: 'a', type: 'Explore', model: 'haiku-5-5', task: 'Map the checkout flow', at: 2, end: 20, rate: 1.6,
    tools: ['Grep checkout', 'Read cart.ts', 'Read pricing.ts', 'Glob src/**/checkout*', 'Bash npm run bench', 'Read db/orders.sql'],
    report: 'Checkout makes 14 price lookups one after another. Batching them into one call should save ~600 ms.',
  },
  {
    id: 'b', type: 'security-reviewer', model: 'opus-5-5', task: 'Audit the auth middleware', at: 3, end: 14, fails: true, rate: 1.1,
    tools: ['Read auth.ts', 'Grep verifyToken', 'Read session.ts', 'Bash redis-cli ping'],
    report: "Couldn't reach the session store (connection refused), so the audit stopped halfway.",
  },
  {
    id: 'c', type: 'general-purpose', model: 'sonnet-5-5', task: 'Profile the slow queries', at: 4, end: 27, rate: 1.9,
    tools: ['Bash npm run profile', 'Read orders.sql', 'Edit orders.sql', 'Bash npm test', 'Bash npm run profile'],
    report: 'Added an index on orders(customer_id, created_at). The slow query went from 840 ms to 90 ms.',
  },
]

let step = 0
let timer
let playing = !reduceMotion.matches
let onScreen = false
const opened = new Set()

const fmt = n => (n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n)))
const dur = s => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`)
const bar = (n, max) => {
  const full = max > 0 ? Math.max(1, Math.round((n / max) * 8)) : 0
  return '▰'.repeat(full) + '▱'.repeat(8 - full)
}

// Where every agent stands at a given step.
function snapshot(t) {
  return SCRIPT.filter(a => t >= a.at).map(a => {
    const ran = Math.min(t, a.end) - a.at
    const phase = t < a.end ? 'running' : a.fails ? 'failed' : 'done'
    const toolsSeen = a.tools.slice(0, Math.min(a.tools.length, 1 + Math.floor(ran / 3)))
    return {
      ...a,
      phase,
      tokens: Math.round((2.4 + ran * a.rate * 1.4) * 1000),
      secs: ran * 3,
      tool: phase === 'running' ? toolsSeen.at(-1) : phase === 'failed' ? 'flatlined' : 'done',
      recent: toolsSeen,
    }
  })
}

function activity(a, root) {
  const isOpen = opened.has(a.id)
  const btn = el('button', '', isOpen ? '▾ hide activity' : '▸ activity')
  btn.type = 'button'
  btn.dataset.act = a.id
  btn.setAttribute('aria-expanded', String(isOpen))
  btn.addEventListener('click', () => {
    if (opened.has(a.id)) opened.delete(a.id)
    else opened.add(a.id)
    render(true)
  })
  root.append(btn)
  if (!isOpen) return
  const list = el('ul', 'act')
  a.recent.forEach((line, i) => {
    const now = i === a.recent.length - 1 && a.phase === 'running'
    list.append(el('li', now ? 'now' : '', `${now ? '› ' : '· '}${line}`))
  })
  if (a.phase !== 'running') list.append(el('li', 'report', a.report))
  root.append(list)
}

function render(keepFocus = false) {
  const focused = keepFocus ? document.activeElement?.dataset?.act : undefined
  const all = snapshot(step)
  const live = all.filter(a => a.phase === 'running')
  const finished = all.filter(a => a.phase !== 'running').reverse()
  const total = all.reduce((n, a) => n + a.tokens, 0)
  const max = Math.max(1, ...live.map(a => a.tokens))

  const head = el('div', 'pane__head')
  head.append(el('b', '', '// AGENTS'), el('span', '', `${live.length} LIVE · ${fmt(total).toUpperCase()} TOKENS`))
  const parts = [head]

  if (all.length === 0) parts.push(el('p', 'done-h', 'No agents jacked in yet. They show up here the moment Claude starts one.'))

  if (live.length) {
    const tiles = el('div', 'pane__tiles')
    live.forEach((a, i) => {
      const look = lookFor(a.type, {})
      const tile = el('div', i === 0 ? 'tile tile--hero' : 'tile')
      const row = el('div', 'tile__row')
      const info = el('div', 'tile__info')
      const name = el('p', 't-name', a.type)
      if (i === 0) name.append(el('span', '', ` · ${a.model}`))
      info.append(name)
      if (i === 0) info.append(el('p', '', a.task))
      info.append(el('p', '', `> ${a.tool}`))
      const meter = el('p', 't-bar', bar(a.tokens, max))
      meter.style.color = COLORS[look.color][0]
      meter.append(el('span', '', ` ${fmt(a.tokens)} · ${dur(a.secs)}`))
      info.append(meter)
      row.append(mascotImg(look, 'running', 'tile__pic', `${MASCOTS[look.mascot].name}, the ${a.type} agent, running`), info)
      tile.append(row)
      activity(a, tile)
      tiles.append(tile)
    })
    parts.push(tiles)
  }

  if (finished.length) {
    const flat = finished.filter(a => a.phase === 'failed').length
    const h = el('p', 'done-h', `FINISHED · ${finished.length}`)
    if (flat) h.append(el('em', '', ` · ${flat} flatlined`))
    parts.push(h)
    for (const a of finished) {
      const look = lookFor(a.type, {})
      const failed = a.phase === 'failed'
      const row = el('div', failed ? 'row row--failed' : 'row')
      const main = el('div', 'row__main')
      const info = el('div', 'row__info')
      info.append(el('p', 'row__name', `${a.type}${failed ? ' · flatlined' : ''}`), el('p', 'row__task', a.task))
      const nums = el('div', 'row__nums')
      nums.append(el('p', '', fmt(a.tokens)), el('p', '', dur(a.secs)))
      main.append(mascotImg(look, a.phase, 'row__pic', `${MASCOTS[look.mascot].name}, the ${a.type} agent, ${failed ? 'flatlined' : 'done'}`), info, nums)
      row.append(main)
      activity(a, row)
      parts.push(row)
    }
  }

  pane.replaceChildren(...parts)
  if (focused) $(`[data-act="${focused}"]`, pane)?.focus()
}

function schedule() {
  clearTimeout(timer)
  if (!playing || !onScreen || document.hidden) return
  timer = setTimeout(() => {
    step = (step + 1) % LOOP
    if (step === 0) opened.clear()
    render(true)
    schedule()
  }, TICK)
}

function setPlaying(on) {
  playing = on
  toggle.setAttribute('aria-pressed', String(!on))
  toggle.textContent = on ? 'Pause demo' : 'Play demo'
  schedule()
}

if (pane) {
  // With reduced motion, show a still moment that has a bit of everything, and wait for a press.
  step = playing ? 0 : 17
  render()
  toggle.addEventListener('click', () => setPlaying(!playing))
  restart.addEventListener('click', () => {
    step = 0
    opened.clear()
    render()
    setPlaying(true)
  })
  setPlaying(playing)
  new IntersectionObserver(entries => {
    onScreen = entries.some(e => e.isIntersecting)
    schedule()
  }).observe(pane)
  document.addEventListener('visibilitychange', schedule)
}

// ---------------------------------------------------------------- the styler
const styler = $('[data-styler]')
if (styler) {
  const typeSelect = $('[data-style-type]', styler)
  const big = $('[data-style-big]', styler)
  const name = $('[data-style-name]', styler)
  const cmd = $('[data-style-cmd]', styler)
  const states = $$('[data-style-state]', styler)
  let look = { ...SIGNATURE.ping }

  const groups = { mascot: MASCOTS, color: COLORS, cosmetic: COSMETICS }
  for (const [key, options] of Object.entries(groups)) {
    const box = $(`[data-style-group="${key}"]`, styler)
    for (const option of Object.keys(options)) {
      const chip = el('button', 'chip')
      chip.type = 'button'
      chip.dataset.key = key
      chip.dataset.value = option
      if (key === 'color') {
        const swatch = el('i')
        swatch.style.setProperty('--c', COLORS[option][0])
        chip.append(swatch)
      }
      chip.append(document.createTextNode(key === 'mascot' ? MASCOTS[option].name : option))
      chip.addEventListener('click', () => {
        look = { ...look, [key]: option }
        update()
      })
      box.append(chip)
    }
  }

  typeSelect.addEventListener('change', () => {
    look = { ...lookFor(typeSelect.value, {}) }
    update()
  })

  function update() {
    const type = typeSelect.value
    const who = MASCOTS[look.mascot].name
    big.src = picture(look, 'running')
    const article = /^[aeiou]/.test(look.cosmetic) ? 'an' : 'a'
    big.alt = `${who} in ${look.color}, wearing ${look.cosmetic === 'none' ? 'no cosmetic' : `${article} ${look.cosmetic}`}`
    name.textContent = `${type} · ${look.mascot} · ${look.color} · ${look.cosmetic}`
    for (const img of states) img.src = picture(look, img.dataset.styleState)
    cmd.textContent = `/netrunner style ${type} ${look.mascot} ${look.color} ${look.cosmetic}`
    for (const chip of $$('.chip[data-key]', styler)) chip.setAttribute('aria-pressed', String(look[chip.dataset.key] === chip.dataset.value))
  }
  update()
}
