import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version

export default defineConfig({
  base: './',
  define: { __TRAZO_VERSION__: JSON.stringify(version) },
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
})
