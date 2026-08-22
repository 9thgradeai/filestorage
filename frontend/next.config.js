/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Proxy /api/* to the backend. Using rewrites (platform layer) instead of a
  // middleware proxy so Vercel streams request bodies at the edge network,
  // avoiding the ~4.5MB edge-function payload limit for large uploads.
  async rewrites() {
    // Resolved at build time (Vercel) / server start (dev, Docker). Production
    // must set API_BACKEND_URL; the localhost default keeps plain `next dev`
    // working without a .env file. 5000 matches backend/.env.example PORT.
    const backend = process.env.API_BACKEND_URL || 'http://localhost:5000';
    return [{ source: '/api/:path*', destination: `${backend}/api/:path*` }];
  },
};

module.exports = nextConfig;