import { readFileSync } from 'node:fs'

const client = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const forbidden = [...client.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1])
const allowed = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@x1a0f3n9/dsh-client-store',
  '@x1a0f3n9/dsh-client-ui-slots',
  '@x1a0f3n9/dsh-client-ui-primitives',
])
const stray = forbidden.filter((specifier) => !allowed.has(specifier))
if (stray.length > 0) {
  throw new Error(`session-timeline client requires specifiers outside the browser module table: ${stray.join(', ')}`)
}
if (forbidden.length === 0) {
  throw new Error('session-timeline client has no require() calls; the module-loader factory is missing')
}
console.log(`session-timeline client externals: ${forbidden.join(', ')}`)
