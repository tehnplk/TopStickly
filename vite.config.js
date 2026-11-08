import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import electron from 'electron'

const { version } = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// Launch Electron once the dev server is listening; quit Vite when the window closes.
const electronDev = {
  name: 'electron-dev',
  configureServer(server) {
    server.httpServer.once('listening', () => {
      const { port } = server.httpServer.address()
      const env = { ...process.env, VITE_DEV_SERVER_URL: `http://localhost:${port}` }
      delete env.ELECTRON_RUN_AS_NODE // set by VS Code; would run Electron as plain Node
      spawn(electron, ['.'], { stdio: 'inherit', env }).on('close', () => process.exit())
    })
  },
}

export default defineConfig({
  base: './',
  plugins: [react(), electronDev],
  define: { __APP_VERSION__: JSON.stringify(version) },
})
