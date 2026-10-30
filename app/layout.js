import './globals.css';
import AppShell from '@/components/AppShell';

export const metadata = {
  title: 'Pizzería',
  description: 'Gestión de comandas, caja, cadete y stock',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'Pizzería', statusBarStyle: 'default' },
  icons: { icon: '/icon-192.png', apple: '/apple-touch-icon.png' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#c8341c',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
