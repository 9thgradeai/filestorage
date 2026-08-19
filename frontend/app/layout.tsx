import type { ReactNode } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import { AuthProvider } from '../lib/auth';
import ToasterProvider from './toaster';
import './globals.css';

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata = {
  title: {
    default: 'Vault · Secure File Storage',
    template: '%s · Vault',
  },
  description:
    'Encrypted file storage with expiring share links, magic-byte validation, and rotating HttpOnly-cookie sessions. Security you can verify.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <AuthProvider>
          <main id="main" className="min-h-screen">
            {children}
          </main>
        </AuthProvider>
        <ToasterProvider />
      </body>
    </html>
  );
}