import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable React strict mode for development best practices
  reactStrictMode: true,

  // Image optimization with remote patterns
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.movieanimation.ai',
      },
    ],
    deviceSizes: [640, 768, 1024, 1280, 1536],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },

  // HTTP headers for security and caching
  async headers() {
    return [
      // Static assets — aggressive caching
      {
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // Public assets — moderate caching
      {
        source: '/animations/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, must-revalidate' },
        ],
      },
      // Images
      {
        source: '/images/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800' },
        ],
      },
      // Fonts
      {
        source: '/fonts/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=2592000' },
        ],
      },
    ];
  },

  // Compress responses
  compress: true,
};

export default nextConfig;
