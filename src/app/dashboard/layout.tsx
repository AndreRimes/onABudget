import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
    Sheet,
    SheetContent,
    SheetTrigger,
} from "@/components/ui/sheet";
import { ChartLineIcon, DollarSign, Home, Menu, Wallet } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

interface DashboardLayoutProps {
  children: ReactNode;
}

const SidebarContent = () => {
  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: Home },
    { href: "/dashboard/accounts", label: "Accounts", icon: Wallet },
    { href: "/dashboard/investments", label: "Investments", icon: ChartLineIcon },
    { href: "/dashboard/checking", label: "Checking", icon: DollarSign },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="p-6">
        <h2 className="text-2xl font-bold">OnABudget</h2>
      </div>
      <Separator />
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <Separator />
      <div className="p-4">
        <Button variant="outline" className="w-full">
          Logout
        </Button>
      </div>
    </div>
  );
};

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="flex h-screen">
      <aside className="hidden w-64 border-r bg-background md:block">
        <SidebarContent />
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b bg-background">
          <div className="flex h-16 items-center gap-4 px-4 md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <SidebarContent />
              </SheetContent>
            </Sheet>
            <h1 className="text-xl font-semibold">OnABudget</h1>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
            {children}
        </main>
      </div>
    </div>
  );
}
