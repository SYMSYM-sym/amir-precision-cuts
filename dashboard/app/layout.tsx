import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';
import { BUSINESS_NAME } from '@/lib/generated-constants';

/**
 * Three welds lived in this file and none are in 14 §C2's table:
 *   - the page title and description named the reference business
 *   - the two Google fonts were that business's typefaces, hardcoded, so every
 *     client's admin panel rendered in a brand it had nothing to do with
 * Title and description come from the generated constants; the fonts are now
 * the neutral system stack, because the dashboard is an internal tool and
 * should not pretend to be the brand.
 */
export const metadata: Metadata = {
  title: `${BUSINESS_NAME} — Content admin`,
  description: `Internal content admin for ${BUSINESS_NAME}. Not indexed.`,
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
