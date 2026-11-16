// Builds every picture in the README straight from the mod's own mascot code, so they can't drift:
//   assets/launch.svg          the launch film (loops, ~42 s)
//   assets/crew.svg            all eight mascots in a bento grid
//   assets/pane.svg            the pane, frozen mid-job
//   assets/looks.svg           every colour and every bit of chrome
//   assets/mascots/<id>.svg    one card per mascot, running / done / flatlined
//   .claude-plugin/icon.png    the plugin icon (512x512)
//   node --import ./scripts/ts-ext.mjs scripts/build-assets.mjs

import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { COLORS, COSMETICS, MASCOTS, ROLES, SIGNATURE, lookFor, mascotSvg } from '../plugins/netrunner-agents/hooks/mascots.ts'
import { EDGE, SURFACE, TEXT } from '../plugins/netrunner-agents/hooks/palette.ts'

const out = new URL('../assets/', import.meta.url)
mkdirSync(new URL('mascots/', out), { recursive: true })

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const SANS = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',Inter,system-ui,sans-serif"
const MONO = "ui-monospace,'SF Mono','Cascadia Code',Consolas,Menlo,monospace"
const BG = SURFACE.pane
const TILE = SURFACE.tile

// A mascot placed inside a bigger SVG (a nested <svg>, no <use> or <image> needed).
const mascot = (look, phase, x, y, w) =>
  mascotSvg(look, phase).replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox', `<svg x="${x}" y="${y}" width="${w}" height="${w * 0.75}" viewBox`)

const text = (x, y, size, color, str, { font = MONO, weight = 400, anchor = 'start', cls = '', spacing = 0, opacity } = {}) =>
  `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}"` +
  `${spacing ? ` letter-spacing="${spacing}"` : ''}${cls ? ` class="${cls}"` : ''}${opacity !== undefined ? ` opacity="${opacity}"` : ''}>${esc(str)}</text>`

const box = (x, y, w, h, fill, stroke, rx = 10) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="2"` : ''}/>`

const bar = (n, max) => {
  const full = Math.max(1, Math.round((n / max) * 8))
  return '▰'.repeat(full) + '▱'.repeat(8 - full)
}

const look = type => lookFor(type, {})
const accent = type => COLORS[look(type).color][0]

// ---------------------------------------------------------------- the pane, drawn as SVG
// One agent tile, the way the mod lays it out.
function tile(x, y, w, a, { hero = false, cls = {} } = {}) {
  const h = hero ? 150 : 118
  const pic = hero ? 120 : 76
  const tx = x + pic + 34
  let s = box(x, y, w, h, TILE, EDGE, 8) + mascot(look(a.type), 'running', x + 16, y + (h - pic * 0.75) / 2 - 8, pic)
  let ty = y + 34
  s += text(tx, ty, 20, TEXT.ink, a.type) + (hero ? text(tx + a.type.length * 12.2 + 10, ty, 20, TEXT.dim, `· ${a.model}`) : '')
  if (hero) s += text(tx, (ty += 28), 18, TEXT.dim, a.task)
  ty += 28
  const tools = Array.isArray(a.tool) ? a.tool : [a.tool]
  tools.forEach((t, i) => (s += text(tx, ty, 18, TEXT.dim, `> ${t}`, { cls: tools.length > 1 ? `${cls.tool ?? ''}${i}` : '' })))
  ty += 30
  const states = Array.isArray(a.tokens) ? a.tokens : [a.tokens]
  states.forEach((n, i) => {
    const c = states.length > 1 ? `${cls.tok ?? ''}${i}` : ''
    s += text(tx, ty, 18, accent(a.type), bar(n.v, a.max ?? 40), { cls: c })
    s += text(tx + 8 * 12.2 + 12, ty, 18, TEXT.dim, `${n.k} · ${n.t}`, { cls: c })
  })
  return s + (hero || a.button ? text(x + 18, y + h - 14, 16, TEXT.cyan, a.open ? '▾ hide activity' : '▸ activity') : '')
}

function paneFrame(x, y, w, h, live, total) {
  return (
    box(x, y, w, h, BG, EDGE, 14) +
    text(x + 24, y + 40, 18, TEXT.yellow, '// AGENTS', { spacing: 1 }) +
    (total ? text(x + w - 24, y + 40, 18, TEXT.cyan, `${live} LIVE · ${total} TOKENS`, { anchor: 'end' }) : '')
  )
}

function finishedRow(x, y, w, a) {
  const failed = a.phase === 'failed'
  return (
    mascot(look(a.type), a.phase, x, y - 6, 52) +
    text(x + 66, y + 14, 18, failed ? TEXT.red : TEXT.soft, a.type + (failed ? ' · flatlined' : '')) +
    text(x + 66, y + 38, 16, TEXT.muted, a.task) +
    text(x + w, y + 14, 18, TEXT.dim, a.k, { anchor: 'end' }) +
    text(x + w, y + 38, 16, TEXT.muted, a.t, { anchor: 'end' })
  )
}

// ---------------------------------------------------------------- the crew card (shared)
const defaultLook = id => SIGNATURE[id]

function crewCard(id, x, y, w, h) {
  const m = MASCOTS[id]
  const l = defaultLook(id)
  const pic = Math.min(w - 80, 200)
  return (
    box(x, y, w, h, TILE, EDGE, 14) +
    mascot(l, 'running', x + (w - pic) / 2, y + 24, pic) +
    text(x + 24, y + h - 54, 26, TEXT.ink, m.name, { font: SANS, weight: 600 }) +
    text(x + 24, y + h - 24, 17, COLORS[l.color][0], ROLES[id])
  )
}

// ---------------------------------------------------------------- the film
const W = 1600
const H = 900
const SCENES = [
  ['title', 5],
  ['crew-in', 6],
  ['live', 6],
  ['peek', 6],
  ['done', 6],
  ['style', 6],
  ['finale', 7],
]
const T = SCENES.reduce((n, [, s]) => n + s, 0)
const START = {}
SCENES.reduce((at, [id, s]) => ((START[id] = at), at + s), 0)
const pct = s => ((Math.max(0, Math.min(T, s)) / T) * 100).toFixed(3)
const keyframes = []
const css = []
let n = 0

// Visible between two moments of the loop (with short fades), hidden the rest of the time.
function between(from, to, fade = 0.5) {
  const name = `k${n++}`
  const a = Math.max(0, from)
  keyframes.push(
    `@keyframes ${name}{0%{opacity:0}${pct(a)}%{opacity:0}${pct(a + fade)}%{opacity:1}${pct(to - fade)}%{opacity:1}${pct(to)}%{opacity:0}100%{opacity:0}}`,
  )
  css.push(`.${name}{opacity:0;animation:${name} ${T}s linear infinite}`)
  return name
}
// Steps through states: state i shows from times[i] to times[i+1] (no fade, like a pixel UI updating).
function steps(times) {
  return times.slice(0, -1).map((t, i) => between(t, times[i + 1], 0.05))
}

const scene = id => [START[id], START[id] + SCENES.find(s => s[0] === id)[1]]
const caption = (str, sub) =>
  text(96, 120, 60, '#FFFFFF', str, { font: SANS, weight: 700 }) + (sub ? text(98, 166, 26, TEXT.dim, sub, { font: SANS }) : '')

// The pane scenes are zoomed 1.25x so the small pane text stays readable when GitHub shrinks the film.
const zoom = body => `<g transform="translate(-200 -55) scale(1.25)">${body}</g>`

const parts = []
const wrap = (cls, body) => parts.push(`<g class="${cls}">${body}</g>`)

// 1. Title
{
  const [s, e] = scene('title')
  let body = text(W / 2, 250, 22, TEXT.yellow, 'NOCASHFLOW PRESENTS', { anchor: 'middle', spacing: 6 })
  body += text(W / 2, 380, 120, '#FFFFFF', 'Meet your crew.', { font: SANS, weight: 700, anchor: 'middle' })
  body += text(W / 2, 450, 32, TEXT.dim, 'Your Claude Code subagents, as tiny pixel mascots.', { font: SANS, anchor: 'middle' })
  const ids = Object.keys(MASCOTS)
  ids.forEach((id, i) => {
    const k = between(s + 0.6 + i * 0.25, e)
    body += `<g class="${k}">${mascot(defaultLook(id), 'running', 140 + i * 165, 560, 140)}</g>`
  })
  wrap(between(s, e), body)
}

// 2. Claude jacks a crew in
const CREW = [
  { type: 'Explore', model: 'haiku-5-5', task: 'Map the checkout flow' },
  { type: 'security-reviewer', model: 'opus-5-5', task: 'Audit the auth middleware' },
  { type: 'general-purpose', model: 'sonnet-5-5', task: 'Profile the slow queries' },
]
{
  const [s, e] = scene('crew-in')
  let body = caption('Claude jacks in a crew.', 'Ask for something big and it splits the job between subagents.')
  body += box(96, 230, 640, 560, '#14141F', EDGE, 16)
  body += box(250, 262, 456, 112, '#2A2A40', null, 14)
  body += text(272, 300, 21, TEXT.ink, 'Checkout feels slow and I want the', { font: SANS })
  body += text(272, 330, 21, TEXT.ink, 'auth middleware audited before', { font: SANS })
  body += text(272, 360, 21, TEXT.ink, 'Friday. Can you dig in?', { font: SANS })
  const reply = between(s + 1.1, e)
  body += `<g class="${reply}">${text(128, 430, 21, TEXT.soft, 'On it, choom. Sending three agents in:', { font: SANS })}${text(128, 470, 21, TEXT.dim, '• one maps the checkout flow', { font: SANS })}${text(128, 505, 21, TEXT.dim, '• one audits the auth middleware', { font: SANS })}${text(128, 540, 21, TEXT.dim, '• one profiles the slow queries', { font: SANS })}${text(128, 600, 18, TEXT.muted, 'Agent ×3', {})}</g>`
  body += paneFrame(800, 230, 704, 560, 3, '6.1K')
  const at = [1.6, 2.2, 2.8]
  body += `<g class="${between(s + at[0], e)}">${tile(824, 280, 656, { ...CREW[0], tool: 'Grep checkout', tokens: { v: 4, k: '2.4k', t: '3s' } }, { hero: true })}</g>`
  body += `<g class="${between(s + at[1], e)}">${tile(824, 446, 656, { ...CREW[1], tool: 'Read auth.ts', tokens: { v: 3, k: '1.9k', t: '2s' } })}</g>`
  body += `<g class="${between(s + at[2], e)}">${tile(824, 580, 656, { ...CREW[2], tool: 'Bash npm run profile', tokens: { v: 2, k: '1.8k', t: '1s' } })}</g>`
  wrap(between(s, e), body)
}

// 3. Live
{
  const [s, e] = scene('live')
  let body = caption('Watch them work. Live.', 'What each one is doing, how long, and exactly how many tokens. ~4 redraws a second, max.')
  let pane = ''
  const ticks = Array.from({ length: 7 }, (_, i) => s + i * (6 / 6))
  ticks[6] = e
  const st = steps(ticks)
  const swap = (lines, at) => lines.map((l, i) => `<g class="${at[i]}">${l}</g>`).join('')
  pane += paneFrame(300, 220, 1000, 540, 3, '')
  const totals = ['38.2K', '41.0K', '44.9K', '49.3K', '53.0K', '57.6K']
  pane += swap(totals.map(t => text(1276, 260, 18, TEXT.cyan, `3 LIVE · ${t} TOKENS`, { anchor: 'end' })), st)
  // Each line is redrawn per step: the pane updates in small jumps, like the real thing (batched).
  const hero = [
    ['Grep checkout', 18.2, '41s'], ['Read cart.ts', 19.0, '42s'], ['Read cart.ts', 20.7, '43s'],
    ['Read pricing.ts', 22.1, '44s'], ['Bash npm run bench', 23.4, '45s'], ['Bash npm run bench', 24.9, '46s'],
  ]
  const sec = [
    ['Read auth.ts', 11.0, '38s'], ['Grep verifyToken', 11.8, '39s'], ['Grep verifyToken', 12.6, '40s'],
    ['Read session.ts', 13.9, '41s'], ['Read session.ts', 14.4, '42s'], ['Read jwt.ts', 15.2, '43s'],
  ]
  const gp = [
    ['Bash npm run profile', 9.0, '36s'], ['Bash npm run profile', 10.1, '37s'], ['Read orders.sql', 11.6, '38s'],
    ['Read orders.sql', 13.3, '39s'], ['Edit orders.sql', 15.0, '40s'], ['Bash npm test', 17.5, '41s'],
  ]
  const draw = (rows, a, y, hero) =>
    rows
      .map(([tool, k, t], i) =>
        `<g class="${st[i]}">${tile(324, y, 952, { ...a, tool, tokens: { v: k, k: `${k}k`, t }, max: 25 }, { hero })}</g>`,
      )
      .join('')
  pane += draw(hero, CREW[0], 280, true) + draw(sec, CREW[1], 450, false) + draw(gp, CREW[2], 588, false)
  wrap(between(s, e), body + zoom(pane))
}

// 4. Peek inside
{
  const [s, e] = scene('peek')
  const body = caption('Peek inside any agent.', 'One click shows its last tool calls, and later its final report.')
  let pane = paneFrame(300, 220, 1000, 540, 3, '61.4K')
  pane += tile(324, 280, 952, { ...CREW[0], tool: 'Read db/orders.sql', tokens: { v: 26, k: '26.0k', t: '58s' }, max: 26, open: true }, { hero: true })
  const lines = ['Grep checkout', 'Read cart.ts', 'Read pricing.ts', 'Bash npm run bench', 'Read db/orders.sql']
  lines.forEach((l, i) => {
    const now = i === lines.length - 1
    pane += `<g class="${between(s + 0.8 + i * 0.6, e)}">${text(360, 470 + i * 36, 19, now ? TEXT.soft : TEXT.muted, `${now ? '›' : '·'} ${l}`)}</g>`
  })
  pane += `<g class="${between(s + 4.2, e)}">${box(900, 470, 360, 150, '#14141F', EDGE, 10)}${text(924, 506, 17, TEXT.dim, 'last 8 tool calls')}${text(924, 540, 17, TEXT.dim, 'final report, once it’s done')}${text(924, 574, 17, TEXT.dim, 'tokens & passwords masked')}${text(924, 604, 15, TEXT.muted, 'plain text only, never links')}</g>`
  wrap(between(s, e), body + zoom(pane))
}

// 5. Done or flatlined
{
  const [s, e] = scene('done')
  const body = caption('Done. Or flatlined.', 'Finished agents tuck into slim rows. Failures glitch, so you can’t miss them.')
  let pane = paneFrame(300, 220, 1000, 540, 0, '88.2K')
  pane += text(324, 290, 17, TEXT.muted, 'FINISHED · 3')
  pane += `<g class="${between(s + 2.2, e)}">${text(452, 290, 17, TEXT.red, '· 1 flatlined')}</g>`
  const rows = [
    { type: 'Explore', task: 'Map the checkout flow', k: '31.4k', t: '1m 12s', phase: 'done' },
    { type: 'general-purpose', task: 'Profile the slow queries', k: '44.0k', t: '2m 3s', phase: 'done' },
    { type: 'security-reviewer', task: 'Audit the auth middleware', k: '12.8k', t: '38s', phase: 'failed' },
  ]
  // The Explore row with its report opened, then the other two below it.
  const ys = [320, 560, 644]
  rows.forEach((a, i) => (pane += `<g class="${between(s + 0.6 + i * 0.7, e)}">${finishedRow(324, ys[i], 952, a)}</g>`))
  pane += `<g class="${between(s + 1, e)}">${text(390, 384, 16, TEXT.cyan, '▾ hide activity')}${box(390, 400, 886, 128, '#14141F', EDGE, 8)}${text(410, 436, 18, TEXT.dim, 'Checkout makes 14 price lookups one after another.')}${text(410, 466, 18, TEXT.dim, 'Batching them into one call should save ~600 ms.')}${text(410, 504, 15, TEXT.muted, 'final report, plain text, secrets masked')}</g>`
  wrap(between(s, e), body + zoom(pane))
}

// 6. Style
{
  const [s, e] = scene('style')
  let body = caption('Make them yours.', '8 mascots, 7 colours, 9 bits of chrome. Any agent type, any combo.')
  const cmd = '/netrunner style Explore node acid visor'
  const cuts = [11, 19, 27, 32, 37, cmd.length]
  const ts = steps([s + 0.2, s + 0.5, s + 0.8, s + 1.1, s + 1.4, s + 1.7, e])
  body += box(300, 230, 1000, 70, '#14141F', EDGE, 12)
  cuts.forEach((c, i) => (body += `<g class="${ts[i]}">${text(330, 274, 26, TEXT.ink, cmd.slice(0, c) + (c < cmd.length ? '▌' : ''))}</g>`))
  // Before: Explore's default (Ping). After the command lands: exactly what was typed.
  const [before, after] = steps([s, s + 1.9, e])
  body += `<g class="${before}">${mascot(SIGNATURE.ping, 'running', 620, 330, 360)}${text(800, 640, 22, TEXT.dim, 'Explore: ping · violet · visor', { anchor: 'middle' })}</g>`
  body += `<g class="${after}">${mascot({ mascot: 'node', color: 'acid', cosmetic: 'visor' }, 'running', 620, 330, 360)}${text(800, 640, 22, TEXT.ink, 'Explore: node · acid · visor  ✓', { anchor: 'middle' })}</g>`
  // A few other combos people might go for.
  const extras = [
    { mascot: 'daemon', color: 'ember', cosmetic: 'mohawk' },
    { mascot: 'byte', color: 'magenta', cosmetic: 'optic' },
    { mascot: 'shell', color: 'violet', cosmetic: 'jack' },
    { mascot: 'proc', color: 'cyan', cosmetic: 'visor' },
    { mascot: 'sentry', color: 'neon', cosmetic: 'chromearm' },
    { mascot: 'fork', color: 'acid', cosmetic: 'mask' },
  ]
  extras.forEach((l, i) => (body += `<g class="${between(s + 2.6 + i * 0.25, e)}">${mascot(l, 'running', 290 + i * 180, 700, 120)}</g>`))
  wrap(between(s, e), body)
}

// 7. Finale: the whole crew + install
{
  const [s, e] = scene('finale')
  let body = text(W / 2, 110, 64, '#FFFFFF', 'netrunner-agents', { font: SANS, weight: 700, anchor: 'middle' })
  body += text(W / 2, 156, 26, TEXT.dim, 'a tiny, preem pane for Claude Code’s subagents', { font: SANS, anchor: 'middle' })
  const ids = Object.keys(MASCOTS)
  ids.forEach((id, i) => {
    const x = 100 + (i % 4) * 356
    const y = 200 + Math.floor(i / 4) * 290
    body += crewCard(id, x, y, 332, 270)
  })
  body += box(300, 800, 1000, 64, '#14141F', EDGE, 12)
  body += text(W / 2, 841, 22, TEXT.cyan, '/plugin install netrunner-agents --marketplace nocashflow/claude-netrunner-agents', { anchor: 'middle' })
  parts.push(`<g class="finale ${between(s, e + 0.01, 0.6)}">${body}</g>`)
}

const film =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">` +
  `<title id="t">netrunner-agents for Claude Code</title>` +
  `<desc id="d">A short looping launch film. A title card with eight pixel mascots, then Claude sending three subagents into a task, the pane updating live with tools, tokens and timers, one agent's activity opened up, the finished and flatlined rows, restyling an agent with a command, and finally all eight mascots with the install command.</desc>` +
  `<style>${keyframes.join('')}${css.join('')}` +
  `@media (prefers-reduced-motion: reduce){*{animation:none!important}g[class]{opacity:0!important}.finale,.finale *{opacity:1!important}}</style>` +
  `<rect width="${W}" height="${H}" fill="${BG}"/>` +
  Array.from({ length: 18 }, (_, i) => `<rect x="0" y="${i * 50}" width="${W}" height="1" fill="#141420"/>`).join('') +
  parts.join('') +
  '</svg>'
writeFileSync(new URL('launch.svg', out), film)

// ---------------------------------------------------------------- static pictures
const page = (w, h, title, desc, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-labelledby="t d"><title id="t">${esc(title)}</title><desc id="d">${esc(desc)}</desc><rect width="${w}" height="${h}" rx="20" fill="${BG}"/>${body}</svg>`

{
  let body = ''
  Object.keys(MASCOTS).forEach((id, i) => (body += crewCard(id, 28 + (i % 4) * 386, 28 + Math.floor(i / 4) * 330, 362, 306)))
  writeFileSync(
    new URL('crew.svg', out),
    page(1600, 692, 'The crew', `The eight mascots: ${Object.values(MASCOTS).map(m => m.name).join(', ')}, each with the agent types it shows up for by default.`, body),
  )
}

{
  let body = paneFrame(20, 20, 860, 760, 2, '61.4K')
  body += tile(44, 80, 812, { ...CREW[0], tool: 'Read db/orders.sql', tokens: { v: 26, k: '26.0k', t: '58s' }, max: 26 }, { hero: true })
  body += tile(44, 246, 812, { ...CREW[1], tool: 'Grep verifyToken', tokens: { v: 15, k: '15.2k', t: '43s' }, max: 26, button: true })
  body += text(44, 412, 17, TEXT.muted, 'FINISHED · 3') + text(172, 412, 17, TEXT.red, '· 1 flatlined')
  ;[
    { type: 'general-purpose', task: 'Profile the slow queries', k: '44.0k', t: '2m 3s', phase: 'done' },
    { type: 'Plan', task: 'Draft the caching plan', k: '12.1k', t: '51s', phase: 'done' },
    { type: 'test-runner', task: 'Run the e2e suite', k: '8.4k', t: '1m 40s', phase: 'failed' },
  ].forEach((a, i) => (body += finishedRow(44, 444 + i * 84, 812, a) + text(110, 444 + i * 84 + 62, 15, TEXT.cyan, '▸ activity')))
  writeFileSync(
    new URL('pane.svg', out),
    page(900, 800, 'The Agents pane', 'The pane mid-job: two live agents with their current tool, token bar and timer, then three finished agents, one of them flatlined.', body),
  )
}

{
  let body = text(40, 64, 26, '#FFFFFF', 'Colours', { font: SANS, weight: 600 })
  Object.keys(COLORS).forEach((c, i) => {
    body += mascot({ mascot: 'proc', color: c, cosmetic: 'none' }, 'running', 40 + i * 220, 90, 180) + text(130 + i * 220, 250, 18, COLORS[c][0], c, { anchor: 'middle' })
  })
  body += text(40, 320, 26, '#FFFFFF', 'Chrome', { font: SANS, weight: 600 })
  Object.keys(COSMETICS).forEach((c, i) => {
    body += mascot({ mascot: 'daemon', color: 'chrome', cosmetic: c }, 'running', 40 + i * 172, 350, 150) + text(115 + i * 172, 490, 18, TEXT.dim, c, { anchor: 'middle' })
  })
  writeFileSync(
    new URL('looks.svg', out),
    page(1600, 530, 'Colours and chrome', `Proc in all seven colours (${Object.keys(COLORS).join(', ')}) and Daemon wearing each of the nine cosmetics (${Object.keys(COSMETICS).join(', ')}).`, body),
  )
}

for (const id of Object.keys(MASCOTS)) {
  const l = defaultLook(id)
  const m = MASCOTS[id]
  let body = mascot(l, 'running', 60, 30, 280)
  ;['running', 'done', 'failed'].forEach((p, i) => {
    body += mascot(l, p, 30 + i * 120, 260, 100) + text(80 + i * 120, 350, 15, p === 'failed' ? TEXT.red : TEXT.muted, p === 'failed' ? 'flatlined' : p, { anchor: 'middle' })
  })
  writeFileSync(
    new URL(`mascots/${id}.svg`, out),
    page(400, 370, m.name, `${m.name}, ${m.bio}. Shown big, then running, done and flatlined.`, body),
  )
}

// ---------------------------------------------------------------- icon.png
// Daemon in a visor, rasterised from the same rects and scaled to 512x512. Just Node and zlib.
{
  const SIZE = 512
  const svg = mascotSvg({ mascot: 'daemon', color: 'magenta', cosmetic: 'visor' }, 'running')
  const grid = Array.from({ length: 64 }, () => Array(64).fill([11, 11, 18]))
  for (const [, x, y, w, h, fill] of svg.matchAll(/<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="#([0-9A-Fa-f]{6})"\/>/g)) {
    const rgb = [0, 2, 4].map(i => parseInt(fill.slice(i, i + 2), 16))
    for (let yy = Math.max(0, +y); yy < Math.min(48, +y + +h); yy += 1)
      for (let xx = Math.max(0, +x); xx < Math.min(64, +x + +w); xx += 1) grid[Math.floor(yy) + 8][Math.floor(xx)] = rgb
  }
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE)
  const cell = SIZE / 64
  for (let y = 0; y < SIZE; y += 1) {
    raw[y * (SIZE * 4 + 1)] = 0
    for (let x = 0; x < SIZE; x += 1) {
      const [r, g, b] = grid[Math.floor(y / cell)][Math.floor(x / cell)]
      const at = y * (SIZE * 4 + 1) + 1 + x * 4
      raw[at] = r
      raw[at + 1] = g
      raw[at + 2] = b
      raw[at + 3] = 255
    }
  }
  const table = Array.from({ length: 256 }, (_, k) => {
    let c = k
    for (let j = 0; j < 8; j += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc32 = buf => {
    let c = 0xffffffff
    for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(SIZE, 0)
  header.writeUInt32BE(SIZE, 4)
  header[8] = 8
  header[9] = 6
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
  writeFileSync(new URL('../plugins/netrunner-agents/.claude-plugin/icon.png', import.meta.url), png)
}

console.log(`launch.svg ${(film.length / 1024).toFixed(0)} KB, ${T}s loop · crew, pane, looks, ${Object.keys(MASCOTS).length} mascot cards, icon.png`)
