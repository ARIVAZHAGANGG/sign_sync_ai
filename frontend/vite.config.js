import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/health': 'http://localhost:5000',
      '/predict': 'http://localhost:5000',
      '/speak': 'http://localhost:5000',
      '/capture': 'http://localhost:5000',
      '/reset': 'http://localhost:5000',
      '/list_gestures': 'http://localhost:5000',
    }
  }
})
