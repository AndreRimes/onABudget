import "~/styles/globals.css";

import { type Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";

import { cn } from "@/lib/utils";
import { Toaster } from "sonner";
import { TRPCReactProvider } from "~/trpc/react";

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-ui",
});

export const metadata: Metadata = {
  title: "On a Budget",
  description: "A simple budgeting app.",
  icons: {
    icon: "/wallet.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn(grotesk.variable, mono.variable)}>
      <body>
        <Toaster
          theme="light"
          toastOptions={{
            className:
              "!rounded-none !border-2 !border-foreground !bg-card !text-foreground !font-mono !text-xs !shadow-[4px_4px_0_0_var(--hard)]",
          }}
        />
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
