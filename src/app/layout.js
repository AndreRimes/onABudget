import { Inter } from 'next/font/google'
import './globals.css'
import { UserProvider } from '@/Domain/userContext'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Create Next App',
  description: 'Generated by create next app',
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