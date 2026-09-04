/**
 * tsdown config for dsh-hotkey (standalone mirror of the official
 * packages/client/tsdown.client.ts preset, following the dsh-history-rewind
 * out-of-tree pattern).
 *
 * Node half: one self-contained ESM bundle of src/index.ts into dist/.
 * Client half: one CJS bundle wrapped in the shell's `window.__ModuleLoader__`
 * protocol (dist/client.js), externalizing the platform module table and
 * inlining the rest.
 */
import { defineConfig, type UserConfig } from 'tsdown'

const ID = 'dsh-hotkey'

/** Shell module-table specifiers the client bundle must NOT inline. */
const CLIENT_EXTERNALS: readonly string[] = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-primitives',
]

const lib: UserConfig = {
  name: ID,
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: true,
  clean: false,
  // One self-contained bundle per entry: with multiple entries tsdown
  // otherwise splits shared modules into a named shared chunk, which the
  // `files` list cannot ship.
  splitting: false,
}

const client: UserConfig = {
  name: `${ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'dist',
  format: 'cjs',
  platform: 'browser',
  // Public browser declarations are shipped from types/client.d.ts because the
  // custom module-loader banner is executable JavaScript rather than Node CJS.
  dts: false,
  sourcemap: true,
  clean: false,
  deps: {
    neverBundle: (specifier: string) => CLIENT_EXTERNALS.includes(specifier),
    alwaysBundle: (specifier: string) => !CLIENT_EXTERNALS.includes(specifier),
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default defineConfig([lib, client])
