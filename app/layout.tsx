import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'نظرة عامة على شبكة توصيل المحتوى Vercel',
  description: 'تعرف على شبكة توصيل المحتوى العالمية من Vercel وكيفية عمل التوجيه والتخزين المؤقت.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl"><body>{children}</body></html>
}
