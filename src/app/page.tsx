import {
  ArrowRight,
  BarChart3,
  ChartLine,
  PiggyBank,
  Shield,
  Target,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import Link from "next/link";

const features = [
  {
    icon: Wallet,
    title: "Contas Integradas",
    description:
      "Gerencie conta corrente e investimentos em um único lugar, com visão unificada do seu patrimônio.",
  },
  {
    icon: Target,
    title: "Orçamento Inteligente",
    description:
      "Defina limites mensais e acompanhe em tempo real se você está dentro do planejado.",
  },
  {
    icon: ChartLine,
    title: "Portfólio de Investimentos",
    description:
      "Acompanhe seus ativos com cotações em tempo real e compare sua rentabilidade com o CDI.",
  },
  {
    icon: BarChart3,
    title: "Análise por Categoria",
    description:
      "Visualize para onde seu dinheiro vai com gráficos detalhados de gastos por categoria.",
  },
  {
    icon: TrendingUp,
    title: "Evolução Patrimonial",
    description:
      "Gráficos históricos mostram como seu patrimônio cresce ao longo do tempo.",
  },
  {
    icon: Shield,
    title: "Seguro & Privado",
    description:
      "Seus dados ficam protegidos com autenticação segura e criptografia de ponta.",
  },
];

const stats = [
  { value: "100%", label: "Gratuito" },
  { value: "24/7", label: "Acesso" },
  { value: "∞", label: "Contas" },
  { value: "<1s", label: "Cotações" },
];

export default function Page() {
  return (
    <div className="bg-background text-foreground relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="bg-primary/10 absolute -top-40 -left-40 h-125 w-125 rounded-full blur-[128px]" />
        <div className="bg-primary/5 absolute -right-40 -bottom-40 h-125 w-125 rounded-full blur-[128px]" />
        <div className="bg-primary/5 absolute top-1/2 left-1/2 h-75 w-75 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[100px]" />
      </div>

      <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 ring-primary/20 flex h-10 w-10 items-center justify-center rounded-xl ring-1">
            <Wallet className="text-primary h-5 w-5" />
          </div>
          <span className="text-xl font-bold tracking-tight">onABudget</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/auth"
            className="text-muted-foreground hover:text-foreground rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            Entrar
          </Link>
          <Link
            href="/auth"
            className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all hover:brightness-110"
          >
            Começar grátis
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pt-20 pb-24 text-center md:pt-32">
        <div className="mx-auto max-w-4xl space-y-8">
          <div className="border-primary/20 bg-primary/5 text-primary inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm">
            <Zap className="h-3.5 w-3.5" />
            Controle financeiro simplificado
          </div>

          <h1 className="text-5xl leading-tight font-bold tracking-tight md:text-7xl">
            Suas finanças,{" "}
            <span className="from-primary bg-linear-to-r to-purple-400 bg-clip-text text-transparent">
              sob controleeeeeeeeeee
            </span>
          </h1>

          <p className="text-muted-foreground mx-auto max-w-2xl text-lg leading-relaxed md:text-xl">
            Gerencie suas contas, acompanhe investimentos em tempo real e
            mantenha seus gastos dentro do orçamento — tudo em uma plataforma
            moderna e intuitiva.
          </p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/auth"
              className="bg-primary text-primary-foreground shadow-primary/25 hover:shadow-primary/30 inline-flex items-center gap-2 rounded-xl px-8 py-4 text-base font-semibold shadow-lg transition-all hover:shadow-xl hover:brightness-110"
            >
              Criar conta grátis
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="#features"
              className="border-border bg-card/50 text-foreground hover:bg-card inline-flex items-center gap-2 rounded-xl border px-8 py-4 text-base font-medium backdrop-blur-sm transition-colors"
            >
              Ver funcionalidades
            </Link>
          </div>
        </div>

        {/* Dashboard preview mockup */}
        <div className="relative mx-auto mt-20 max-w-5xl">
          <div className="from-primary/20 via-primary/5 absolute -inset-4 rounded-3xl bg-linear-to-b to-transparent blur-2xl" />
          <div className="border-border/50 bg-card/80 shadow-primary/10 relative overflow-hidden rounded-2xl border shadow-2xl backdrop-blur">
            {/* Mock browser bar */}
            <div className="border-border/50 bg-card flex items-center gap-2 border-b px-4 py-3">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-red-500/70" />
                <div className="h-3 w-3 rounded-full bg-yellow-500/70" />
                <div className="h-3 w-3 rounded-full bg-green-500/70" />
              </div>
              <div className="bg-background/50 text-muted-foreground ml-4 flex-1 rounded-md px-4 py-1 text-xs">
                app.onabudget.com/dashboard
              </div>
            </div>
            {/* Mock dashboard content */}
            <div className="p-6 md:p-8">
              <div className="grid gap-4 md:grid-cols-4">
                {[
                  {
                    label: "Patrimônio Total",
                    value: "R$ 47.832,50",
                    change: "+12.4%",
                  },
                  {
                    label: "Rendimento",
                    value: "R$ 3.291,00",
                    change: "+8.2%",
                  },
                  {
                    label: "Gasto Mensal",
                    value: "R$ 2.450,00",
                    change: "-5.1%",
                  },
                  { label: "Orçamento", value: "78%", change: "Dentro" },
                ].map((card) => (
                  <div
                    key={card.label}
                    className="border-border/50 bg-background/50 rounded-xl border p-4"
                  >
                    <p className="text-muted-foreground text-xs">
                      {card.label}
                    </p>
                    <p className="mt-1 text-xl font-bold">{card.value}</p>
                    <p
                      className={`mt-0.5 text-xs ${card.change.startsWith("+") ? "text-green-500" : card.change.startsWith("-") ? "text-emerald-500" : "text-primary"}`}
                    >
                      {card.change}
                    </p>
                  </div>
                ))}
              </div>
              {/* Mock chart area */}
              <div className="border-border/50 bg-background/50 mt-6 flex h-44 items-end gap-1.5 rounded-xl border p-6">
                {[35, 45, 30, 55, 65, 50, 70, 60, 80, 75, 85, 90].map(
                  (h, i) => (
                    <div
                      key={i}
                      className="from-primary/60 to-primary flex-1 rounded-t-sm bg-linear-to-t transition-all"
                      style={{ height: `${h}%` }}
                    />
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-border/50 bg-card/30 relative z-10 border-y backdrop-blur">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-6 py-16 md:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-primary text-4xl font-bold">{stat.value}</p>
              <p className="text-muted-foreground mt-1 text-sm">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section
        id="features"
        className="relative z-10 mx-auto max-w-7xl px-6 py-24 md:py-32"
      >
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Tudo que você precisa para{" "}
            <span className="text-primary">dominar suas finanças</span>
          </h2>
          <p className="text-muted-foreground mt-4 text-lg">
            Ferramentas poderosas e simples para você tomar decisões financeiras
            melhores todos os dias.
          </p>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group border-border/50 bg-card/50 hover:border-primary/30 hover:bg-card/80 hover:shadow-primary/5 rounded-2xl border p-6 backdrop-blur-sm transition-all hover:shadow-lg"
            >
              <div className="bg-primary/10 text-primary group-hover:bg-primary/20 flex h-12 w-12 items-center justify-center rounded-xl transition-colors">
                <feature.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{feature.title}</h3>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-24">
        <div className="border-primary/20 from-primary/10 via-card to-primary/5 relative overflow-hidden rounded-3xl border bg-linear-to-br px-8 py-16 text-center md:px-16 md:py-20">
          <div className="bg-primary/10 absolute -top-20 -right-20 h-64 w-64 rounded-full blur-[80px]" />
          <div className="bg-primary/10 absolute -bottom-20 -left-20 h-64 w-64 rounded-full blur-[80px]" />

          <div className="relative space-y-6">
            <div className="flex justify-center">
              <PiggyBank className="text-primary h-16 w-16" />
            </div>
            <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight md:text-4xl">
              Comece a controlar suas finanças hoje
            </h2>
            <p className="text-muted-foreground mx-auto max-w-lg">
              Junte-se a quem já transformou a relação com o dinheiro. É grátis,
              rápido e seguro.
            </p>
            <Link
              href="/auth"
              className="bg-primary text-primary-foreground shadow-primary/25 hover:shadow-primary/30 inline-flex items-center gap-2 rounded-xl px-8 py-4 text-base font-semibold shadow-lg transition-all hover:shadow-xl hover:brightness-110"
            >
              Criar minha conta
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-border/50 relative z-10 border-t">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-8">
          <div className="flex items-center gap-2">
            <Wallet className="text-primary h-4 w-4" />
            <span className="text-sm font-semibold">onABudget</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

