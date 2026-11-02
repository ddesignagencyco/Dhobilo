import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  /** @dhoblio/shared ships TypeScript source, so Next has to compile it rather than expect a build. */
  transpilePackages: ['@dhoblio/shared'],

  /**
   * Off deliberately: it is incompatible with next-intl's path convention. Every link in the app is
   * written locale-less (`/admin/vendors`) and next-intl adds the prefix, but typedRoutes only knows the
   * real route (`/[locale]/admin/vendors`), so it rejects every correct link in the codebase.
   */
  typedRoutes: false,

  images: {
    // Vendor documents, rider photos and complaint attachments all come from Cloudinary.
    remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com' }],
  },

  async headers() {
    return [
      {
        // The admin panel shows CNIC images and payout figures: keep it out of caches and frames entirely.
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
        ],
      },
      {
        source: '/:locale/admin/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }],
      },
    ];
  },
};

export default withNextIntl(config);
