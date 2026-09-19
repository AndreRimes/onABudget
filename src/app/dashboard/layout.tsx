"use client";

import { Button } from "@/components/ui/button";
import { ChartLineIcon, DollarSign, Home, LogOut, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { authClient } from "~/server/better-auth/client";

interface DashboardLayoutProps {
  children: ReactNode;
}

const navItems = [
  { href: "/dashboard", label: "início", icon: Home, swatch: "bg-primary" },
  {
    href: "/dashboard/accounts",
    label: "contas",
    icon: Wallet,
    swatch: "bg-chart-1",
  },
  {
    href: "/dashboard/investments",
    label: "investimentos",
    icon: ChartLineIcon,
    swatch: "bg-chart-3",
  },
  {
    href: "/dashboard/checking",
    label: "conta corrente",
    icon: DollarSign,
    swatch: "bg-highlight",
  },
];

export default function DashboardLayout({
  children,
}: Readonly<DashboardLayoutProps>) {
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = async () => {
    await authClient.signOut();
    router.push("/auth");
    router.refresh();
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
        {/* Header record */}
        <header className="border-foreground bg-card border-2 p-5 shadow-[6px_6px_0_0_var(--hard)] md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="display text-3xl md:text-4xl">ON A BUDGET</h1>
              <p className="form-label mt-2">
                CONTROLE FINANCEIRO · CARTEIRA PESSOAL
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut />
              sair
            </Button>
          </div>

          <nav className="mt-5 flex flex-wrap gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`border-foreground inline-flex items-center gap-2 border-2 px-3 py-1.5 font-mono text-xs font-bold tracking-wider uppercase shadow-[3px_3px_0_0_var(--hard)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_0_var(--hard)] ${
                    active
                      ? "bg-hard text-highlight"
                      : "bg-card text-foreground"
                  }`}
                >
                  <span
                    className={`border-foreground size-3 border-2 ${item.swatch}`}
                  />
                  <Icon className="size-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="mt-6">{children}</main>
      </div>
    </div>
  );
}
