// Small helper so Node can find the plugin's imports without file extensions ('./kit' instead of './kit.ts'),
// the same way Claude Code does. Use it like: node --import ./scripts/ts-ext.mjs scripts/<script>.mjs
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier)) return next(`${specifier}.ts`, context)
      throw error
    }
  },
})
