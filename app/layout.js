import './globals.css';
import AppShell from '@/components/AppShell';

export const metadata = {
  title: 'Tope de Pizza',
  description: 'Comandas, caja, cadete y stock de Tope de Pizza',
  applicationName: 'Tope de Pizza',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'Tope de Pizza', statusBarStyle: 'default' },
  icons: { icon: '/favicon.png', apple: '/apple-touch-icon.png' },
  formatDetection: { telephone: false },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#fbf3ea',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
