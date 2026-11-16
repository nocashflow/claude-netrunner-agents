// The checks I run before anything gets pushed (CI runs them too). If one fails, the build fails.
//   node --import ./scripts/ts-ext.mjs scripts/audit.mjs
//
// Accessibility
//   - Contrast (WCAG 2.2): every text colour at least 4.5:1 on the pane, the tiles and the app's dark surfaces.
//   - No motion: the mascots are still images. No animation anywhere in what the mod draws.
// Safety
//   - Every mascot, in every colour, cosmetic and state, is plain SVG: <svg>, <g> and <rect> only.
//   - Secrets get masked before they're stored or shown, and normal text is left alone.
//   - Saved looks are checked: unknown names and prototype tricks are thrown away.
//   - The mod's code never reaches the network, files, processes, models or tools, never runs code
//     from a string and never draws links or Markdown.
// Efficiency
//   - Updates are batched (>= 200 ms), the timer ticks at most once a second, history is capped.

import { readFileSync, readdirSync } from 'node:fs'
import { COLORS, COSMETICS, MASCOTS, isLook, lookFor, mascotSvg } from '../plugins/netrunner-agents/hooks/mascots.ts'
import { HOST_SURFACES, SURFACE, TEXT } from '../plugins/netrunner-agents/hooks/palette.ts'
import { clip, redact } from '../plugins/netrunner-agents/hooks/privacy.ts'

let failures = 0
const fail = message => {
  failures += 1
  console.log(`  FAIL ${message}`)
}
const pass = message => console.log(`  ok   ${message}`)
const check = (ok, message) => (ok ? pass(message) : fail(message))

// ---------------------------------------------------------------- contrast
function luminance(hex) {
  const [r, g, b] = [1, 3, 5]
    .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

console.log('Text contrast (WCAG 2.2 AA is 4.5:1, AAA is 7:1)')
const surfaces = [...Object.values(SURFACE), ...HOST_SURFACES]
for (const [name, color] of Object.entries(TEXT)) {
  const worst = Math.min(...surfaces.map(s => ratio(color, s)))
  check(worst >= 4.5, `${name.padEnd(7)} ${color}  worst ${worst.toFixed(1)}:1`)
}

// ---------------------------------------------------------------- mascots
console.log('Mascots')
const allowed = /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 64 48" shape-rendering="crispEdges"( opacity="0\.5")?>(<g opacity="0\.55">|<\/g>|<rect x="-?[0-9.]+" y="-?[0-9.]+" width="[0-9.]+" height="[0-9.]+" fill="#[0-9A-Fa-f]{6}"\/>)*<\/svg>$/
let combos = 0
let biggest = 0
const bad = []
for (const mascot of Object.keys(MASCOTS)) {
  for (const color of Object.keys(COLORS)) {
    for (const cosmetic of Object.keys(COSMETICS)) {
      for (const phase of ['running', 'done', 'failed']) {
        const svg = mascotSvg({ mascot, color, cosmetic }, phase)
        combos += 1
        biggest = Math.max(biggest, svg.length)
        if (!allowed.test(svg)) bad.push(`${mascot}/${color}/${cosmetic}/${phase}`)
        if (/animat|@keyframes|<style|<script|href|on[a-z]+=/i.test(svg)) bad.push(`${mascot}/${color}/${cosmetic}/${phase} moves or scripts`)
      }
    }
  }
}
check(bad.length === 0, `${combos} combinations are plain <svg>/<g>/<rect>, no animation${bad.length ? `: ${bad.slice(0, 3).join(', ')}` : ''}`)
check(biggest < 8000, `biggest mascot is ${biggest} characters (Claude Code allows 131072)`)
check(
  mascotSvg({ mascot: 'ping', color: 'acid', cosmetic: 'visor' }, 'running') === mascotSvg({ mascot: 'ping', color: 'acid', cosmetic: 'visor' }, 'running'),
  'same look in, same picture out',
)

// ---------------------------------------------------------------- looks
console.log('Saved looks')
check(isLook({ mascot: 'daemon', color: 'neon', cosmetic: 'visor' }), 'a real look is accepted')
for (const junk of [
  null,
  'daemon',
  { mascot: 'daemon', color: 'neon' },
  { mascot: '__proto__', color: 'neon', cosmetic: 'none' },
  { mascot: 'daemon', color: 'toString', cosmetic: 'none' },
  { mascot: 'daemon', color: 'neon', cosmetic: '<script>' },
  { mascot: 'daemon', color: '"/><script>alert(1)</script>', cosmetic: 'none' },
]) {
  check(!isLook(junk), `rejects ${JSON.stringify(junk)}`)
}
check(lookFor('__proto__', {}).mascot in MASCOTS, 'a weird agent type still gets a real mascot')
check(lookFor('security-reviewer', {}).mascot === 'sentry', 'reviewers get Sentry')
check(lookFor('test-runner', {}).mascot === 'byte', 'test runners get Byte')

// ---------------------------------------------------------------- secrets
// These are FAKE keys, shaped like real ones so the masking gets a proper test. Each is glued
// together from pieces at run time, so secret scanners (and GitHub push protection) don't
// mistake this file for one that leaks a real key.
const fake = (...parts) => parts.join('')
console.log('Secrets are masked')
const leaks = [
  [`curl -H "Authorization: Bearer ${fake('abcdef', '1234567890', 'abcdef')}" api`, fake('abcdef', '1234567890')],
  [`export ANTHROPIC_API_KEY=${fake('sk-', 'ant-', 'api03-', 'abcdefghijklmnop')}`, 'abcdefghijklmnop'],
  [`git clone https://me:${fake('hunter2', 'pass')}@github.com/x/y`, fake('hunter2', 'pass')],
  [`gh auth login --with-token ${fake('gh', 'p_', 'abcdefghijklmnopqrstuvwxyz', '123456')}`, 'abcdefghijklmnopqrstuvwxyz'],
  [`mysql --password=${fake('super', 'secret', '123')} -u root`, fake('super', 'secret', '123')],
  [`STRIPE_KEY=${fake('sk', '_live_', '51H', 'abcdefghijklmn')} node app.js`, fake('51H', 'abcdefghijklmn')],
  [`aws configure set aws_access_key_id ${fake('AK', 'IA', 'ABCDEFGHIJKLMNOP')}`, 'ABCDEFGHIJKLMNOP'],
  [`token: ${fake('eyJ', 'hbGciOiJIUzI1NiJ9', '.', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', '.', 'abcdefghij')}`, fake('eyJ', 'zdWIiOiIxMjM0NTY3ODkwIn0')],
  ['DB_PASSWORD="correct horse battery"', 'correct horse battery'],
  [`${fake('xo', 'xb-', '123456789012', '-abcdefghijkl')} slack`, fake('123456789012', '-abcdefghijkl')],
  [fake('-----BEGIN RSA ', 'PRIVATE KEY-----\n', 'MIIEow', '\n-----END RSA ', 'PRIVATE KEY-----'), 'MIIEow'],
]
for (const [input, secret] of leaks) check(!redact(input).includes(secret), `masks ${redact(input).slice(0, 44).replace(/\n/g, ' ')}…`)

console.log('Normal text is left alone')
for (const plain of [
  'Audit the auth middleware',
  'Find why the password reset email is slow',
  'Grep useSession',
  'Read token-utils.ts',
  'Bash npm test -- --watch=false',
  'Review the secret sharing feature',
]) {
  check(redact(plain) === plain, `"${plain}"`)
}
check(clip('a\u001b[31mred‮evil', 99) === 'a[31mredevil', 'control and direction-override characters are dropped')
check(clip('x'.repeat(500), 160).length === 160, 'long text is cut short')

// ---------------------------------------------------------------- the mod's own code
console.log('Mod code')
const hooks = new URL('../plugins/netrunner-agents/hooks/', import.meta.url)
const risky =
  /fetch\(|XMLHttpRequest|WebSocket|EventSource|\$\.(fs|process|model|tool|http|mcp|session)\b|\$\.agent\.(?!list\b)|\beval\(|new Function|\bimport\(|\brequire\(|https?:\/\/(?!www\.w3\.org\/2000\/svg)|postMessage|setTimeout|setInterval|globalThis|<Markdown|<Link|<Client|dangerously/
for (const file of readdirSync(hooks)) {
  if (!/\.(ts|tsx|js)$/.test(file) || file.endsWith('.d.ts')) continue
  const source = readFileSync(new URL(file, hooks), 'utf8')
  const lines = source.split('\n')
  const hit = lines.findIndex(line => !line.trim().startsWith('//') && risky.test(line))
  check(hit < 0, hit < 0 ? `${file} stays inside Claude Code's sandbox` : `${file}:${hit + 1} ${lines[hit].trim().slice(0, 80)}`)
}

// ---------------------------------------------------------------- the website (docs/)
console.log('Website')
const docs = new URL('../docs/', import.meta.url)
const html = readFileSync(new URL('index.html', docs), 'utf8')
const siteJs = readFileSync(new URL('site.js', docs), 'utf8')
const css = readFileSync(new URL('site.css', docs), 'utf8')
const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? ''
check(/script-src 'self'/.test(csp) && !/unsafe-(inline|eval)/.test(csp) && /default-src 'none'/.test(csp), 'a strict Content Security Policy: own scripts only, nothing inline, nothing else by default')
const scripts = [...html.matchAll(/<script([^>]*)>/g)].map(m => m[1])
check(scripts.every(a => /type="application\/ld\+json"/.test(a) || /src="site\.js"/.test(a)), 'no inline JavaScript: only site.js and the structured-data block')
check(!/\s(src|href)="(https?:)?\/\/(?!github\.com\/nocashflow|nocashflow\.github\.io)/.test(html.replace(/<a [^>]*>/g, '')), 'nothing loaded from another site (no CDNs, fonts, trackers or analytics)')
const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map(m => m[0])
check(imgs.every(i => /\salt="/.test(i)), `all ${imgs.length} images have alt text`)
const siteCode = siteJs.split('\n').filter(line => !line.trim().startsWith('//')).join('\n')
check(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|fetch\(|XMLHttpRequest|localStorage|cookie/.test(siteCode), 'site.js writes text with textContent only, sends nothing, stores nothing')
check(/prefers-reduced-motion/.test(siteJs) && /prefers-reduced-motion: reduce/.test(css), 'the demo and page respect reduced motion')
check(/visibilitychange/.test(siteJs) && /IntersectionObserver/.test(siteJs), 'the demo pauses when off screen or the tab is hidden')
const token = name => css.match(new RegExp(`--${name}: (#[0-9a-f]{6})`))?.[1]
for (const [fg, bg] of [['ink', 'page'], ['ink-2', 'page'], ['ink-3', 'page'], ['ink-2', 'plate'], ['ink-3', 'plate'], ['ink-3', 'tile'], ['red-text', 'tile'], ['cyan', 'plate'], ['yellow', 'page']]) {
  const r = ratio(token(fg), token(bg))
  check(r >= 4.5, `site text ${fg} on ${bg}: ${r.toFixed(1)}:1`)
}
check(/"@type": "FAQPage"/.test(html) && /<link rel="canonical"/.test(html) && /og:image/.test(html), 'search and share basics: canonical URL, Open Graph image, FAQ structured data')

console.log('Efficiency')
const register = readFileSync(new URL('register.tsx', hooks), 'utf8')
const constant = name => Number(register.match(new RegExp(`const ${name} = (\\d+)`))?.[1])
check(constant('FLUSH_MS') >= 200, `updates batched every ${constant('FLUSH_MS')} ms (at most ~${Math.floor(1000 / constant('FLUSH_MS'))} redraws a second)`)
check(constant('TICK_MS') >= 1000, `timer ticks every ${constant('TICK_MS')} ms, only while an agent runs and the pane is open`)
check(constant('RECENT') <= 10 && constant('STORE_FINISHED') <= 25, `history capped: ${constant('RECENT')} tool lines per agent, ${constant('STORE_FINISHED')} finished agents`)
check(/ticker\?\.cancel\(\)/.test(register), 'the timer stops itself when nothing is running')

console.log(failures === 0 ? '\nAll checks passed. Preem.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
