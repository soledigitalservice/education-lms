import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { getLocale } from '@/lib/i18n/server';
import { getDict } from '@/lib/i18n/dict';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const DESCRIPTION =
  'Cursos, clases en vivo, tareas, calificaciones, chat y vinculación familiar en una sola plataforma educativa moderna, segura y accesible desde cualquier dispositivo.';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'Education LMS — Plataforma educativa todo-en-uno',
    template: '%s · Education LMS',
  },
  description: DESCRIPTION,
  applicationName: 'Education LMS',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Education LMS',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/icon-192.png',
  },
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    siteName: 'Education LMS',
    title: 'Education LMS — Plataforma educativa todo-en-uno',
    description: DESCRIPTION,
    images: [{ url: '/icons/icon-512.png', width: 512, height: 512, alt: 'Education LMS' }],
  },
  twitter: {
    card: 'summary',
    title: 'Education LMS',
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2563eb',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = getLocale();
  const dict = getDict(locale);
  return (
    <html lang={locale} className={inter.variable}>
      <body className="font-sans">
        <Providers locale={locale} dict={dict}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
