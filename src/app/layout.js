import { Inter } from 'next/font/google'
import './globals.css'
import { UserProvider } from '@/Domain/userContext'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'On a Budget',
  description: '',
}

export default function RootLayout({ children }) {
  return (
    <UserProvider>
      <html lang="en">
        <body className={`${inter.className} bg-Dark text-tx`}>{children}</body>
      </html>
    </UserProvider>
  )
}
