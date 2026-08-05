import path from 'node:path'

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  images: { unoptimized: true },
  // The progression rules live in ../src so the Expo app and this app share one
  // implementation and one test suite. Importing across the app root is only
  // safe once Next knows where the real project root is.
  outputFileTracingRoot: path.join(import.meta.dirname, '..'),
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }]
  },
}

export default nextConfig
