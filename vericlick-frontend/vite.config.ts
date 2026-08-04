import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

function seoFiles(): Plugin {
  const siteUrl = (process.env.VITE_SITE_URL ?? 'https://vericlick.io').replace(/\/+$/, '')
  return {
    name: 'vericlick-seo-files',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: [
          'User-agent: *',
          'Allow: /',
          'Disallow: /auth/',
          'Disallow: /app/',
          '',
          `Sitemap: ${siteUrl}/sitemap.xml`,
          '',
        ].join('\n'),
      })
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          '  <url>',
          `    <loc>${siteUrl}/</loc>`,
          '    <priority>1.0</priority>',
          '  </url>',
          '  <url>',
          `    <loc>${siteUrl}/auth/login</loc>`,
          '    <priority>0.3</priority>',
          '  </url>',
          '  <url>',
          `    <loc>${siteUrl}/auth/register</loc>`,
          '    <priority>0.3</priority>',
          '  </url>',
          '</urlset>',
          '',
        ].join('\n'),
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), seoFiles()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/r/': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
