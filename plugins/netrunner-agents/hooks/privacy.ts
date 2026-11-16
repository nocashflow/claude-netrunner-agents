// Keeping secrets off screen. Everything the pane shows that came from an agent (its task, the commands
// it runs, its final report) goes through here first. Pure functions, so scripts/audit.mjs tests them too.
//
// It masks the obvious stuff: API keys, tokens, passwords in commands, credentials in URLs. It's
// regex-based, so it's a safety net, not a guarantee. Nothing it sees ever leaves your machine anyway.

const SECRET_PATTERNS: [RegExp, string][] = [
  // Provider keys and tokens with a known prefix
  [/\b(sk-ant-[a-z0-9]{2,4})[a-z0-9_-]{8,}/gi, '$1•••'],
  [/\bsk-[a-z0-9_-]{16,}/gi, 'sk-•••'],
  [/\b(sk|pk|rk)_(live|test)_[a-z0-9]{6,}/gi, '$1_$2_•••'],
  [/\b(gh[pousr]_)[a-z0-9]{10,}/gi, '$1•••'],
  [/\bgithub_pat_[a-z0-9_]{10,}/gi, 'github_pat_•••'],
  [/\b(xox[abposr]-)[a-z0-9-]{6,}/gi, '$1•••'],
  [/\bAKIA[0-9A-Z]{12,}/g, 'AKIA•••'],
  [/\bAIza[0-9a-z_-]{20,}/gi, 'AIza•••'],
  [/\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]+/gi, 'eyJ•••'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[private key]'],
  // Authorization headers
  [/\b(bearer|basic|token)\s+[a-z0-9._~+/=-]{12,}/gi, '$1 •••'],
  // user:password@ in URLs
  [/(:\/\/[^:/\s@]+:)[^@\s]+@/g, '$1•••@'],
  // NAME=value / name: value where the name says it's secret (needs = or :, so plain prose is left alone)
  [/\b([a-z0-9_]*(?:pass(?:word)?|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|credential)s?[a-z0-9_]*)(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s"',;]+)/gi, '$1$2•••'],
  // --password value, --token=value, -p value is too common to guess at, so only the spelled-out flags
  [/(--(?:pass(?:word)?|token|secret|api-key|apikey|access-key|auth-token)(?:=|\s+))("[^"]*"|'[^']*'|\S+)/gi, '$1•••'],
]

export function redact(text: string): string {
  let out = text
  for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement)
  return out
}

/** Drops control characters (terminal escapes and the like) and cuts to `max` characters. */
export function clip(text: string, max: number): string {
  const clean = text.replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F‪-‮⁦-⁩]/g, '')
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}
