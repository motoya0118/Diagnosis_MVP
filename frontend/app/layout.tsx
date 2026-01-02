import type { Metadata } from 'next';
import '../styles/globals.css';
import React from 'react';
import Header from '../components/layout/Header';
import Providers from './providers';
import { Inter } from 'next/font/google';
import { getServerSession } from 'next-auth';

import { authOptions } from '../lib/auth/options';

export const metadata: Metadata = {
  title: 'ITキャリア診断チャート',
  description: '最大10階層で導くITキャリア診断',
};

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  return (
    <html lang="ja">
      <head />
      <body className={inter.className}>
        <Providers session={session}>
          <Header />
          {children}
        </Providers>
        <footer className="site-footer">
          <div className="container small">© {new Date().getFullYear()} Motoya. All rights reserved.</div>
        </footer>
      </body>
    </html>
  );
}
