import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Åre Circles',
  description: 'Interactive generative circles visual for Åre Business Forum',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="overflow-hidden">{children}</body>
    </html>
  );
}
