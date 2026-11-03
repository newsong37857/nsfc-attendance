import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'NSFC Kids Check-In',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'NSFC Kids' },
}

export default function KidsLayout({ children }: { children: React.ReactNode }) {
  return children
}
