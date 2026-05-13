/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Next 14.x: allow static prerender when useSearchParams is used in layout (e.g. FeedbackFab).
  // Layout wraps FeedbackFab in Suspense via FeedbackFabWithSuspense; this avoids build failure
  // until we can rely on that boundary being recognized for all routes.
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
}

module.exports = nextConfig
