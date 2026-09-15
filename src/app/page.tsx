import {
  ArrowRight,
  BarChart3,
  ChartLine,
  PiggyBank,
  Shield,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";

const features = [
  {
    code: "LP-0001",
    icon: Wallet,
    title: "Contas Integradas",
    description:
      "Gerencie conta corrente e investimentos em um único lugar, com visão unificada do seu patrimônio.",
    tags: ["conta corrente", "investimentos"],
    tone: "bg-primary",
  },
  {
    code: "LP-0002",
    icon: Target,
    title: "Orçamento Inteligente",
    description:
      "Defina limites mensais e acompanhe em tempo real se você está dentro do planejado.",
    tags: ["limite mensal", "alertas"],
    tone: "bg-highlight",
  },
  {
    code: "LP-0003",
    icon: ChartLine,
    title: "Portfólio de Investimentos",
    description:
      "Acompanhe seus ativos com cotações em tempo real e compare sua rentabilidade com o CDI.",
    tags: ["cotações", "cdi", "rentabilidade"],
    tone: "bg-card",
  },
  {
    code: "LP-0004",
    icon: BarChart3,
    title: "Análise por Categoria",
    description:
      "Visualize para onde seu dinheiro vai com gráficos detalhados de gastos por categoria.",
    tags: ["categorias", "gráficos"],
    tone: "bg-card",
  },
  {
    code: "LP-0005",
    icon: TrendingUp,
    title: "Evolução Patrimonial",
    description:
      "Gráficos históricos mostram como seu patrimônio cresce ao longo do tempo.",
    tags: ["histórico", "patrimônio"],
    tone: "bg-highlight",
  },
  {
    code: "LP-0006",
    icon: Shield,
    title: "Seguro & Privado",
    description:
      "Seus dados ficam protegidos com autenticação segura e criptografia de ponta.",
    tags: ["autenticação", "criptografia"],
    tone: "bg-primary",
  },
];

const stats = [
  { value: "100%", label: "Gratuito", tone: "bg-primary" },
  { value: "24/7", label: "Acesso", tone: "bg-card" },
  { value: "∞", label: "Contas", tone: "bg-highlight" },
  { value: "<1s", label: "Cotações", tone: "bg-card" },
];

const tickerEntries = [
  "ONABUDGET",
  "CONTROLE FINANCEIRO",
  "ORÇAMENTO · INVESTIMENTOS · PATRIMÔNIO",
  "GRATUITO",
];

const mockCards = [
  { label: "Patrimônio Total", value: "R$ 47.832,50", change: "+12.4%" },
  { label: "Rendimento", value: "R$ 3.291,00", change: "+8.2%" },
  { label: "Gasto Mensal", value: "R$ 2.450,00", change: "-5.1%" },
  { label: "Orçamento", value: "78%", change: "Dentro" },
];

export default function Page() {
  return (
    <div className="min-h-screen">
      {/* Ticker strip */}
      <div className="bg-hard text-highlight overflow-hidden py-1.5">
        <div className="ticker font-mono text-[11px] tracking-[0.2em] whitespace-nowrap uppercase">
          {[0, 1].map((copy) => (
            <span key={copy} aria-hidden={copy === 1 ? true : undefined}>
              {tickerEntries.map((entry) => (
                <span key={entry} className="px-6">
                  {entry} <span className="text-highlight/50">·</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
        {/* Header record */}
        <header className="border-foreground bg-card flex flex-wrap items-center justify-between gap-4 border-2 p-5 shadow-[6px_6px_0_0_var(--hard)] md:p-6">
          <div className="flex items-center gap-3">
            <span className="border-foreground bg-primary flex size-10 items-center justify-center border-2">
              <Wallet className="size-5" />
            </span>
            <div>
              <p className="text-xl font-black tracking-tight uppercase">
                onABudget
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/auth">entrar</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/auth">
                começar grátis
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </header>

        {/* Hero */}
        <section className="border-foreground bg-card mt-6 border-2 p-6 shadow-[6px_6px_0_0_var(--hard)] md:p-10">
          <h1 className="display text-4xl leading-[0.95] md:text-6xl">
            Suas finanças,
            <br />
            sob controle
          </h1>
          <p className="text-muted-foreground mt-6 max-w-2xl text-base leading-relaxed md:text-lg">
            Gerencie suas contas, acompanhe investimentos em tempo real e
            mantenha seus gastos dentro do orçamento — tudo em um único
            registro.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link href="/auth">
                criar conta grátis
                <ArrowRight />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="#features">ver funcionalidades</Link>
            </Button>
          </div>

          {/* Dashboard preview record */}
          <div className="border-foreground mt-10 border-2 shadow-[6px_6px_0_0_var(--hard)]">
            <div className="strip flex items-center justify-between">
              <span>app.onabudget.com/dashboard</span>
              <span className="hidden font-normal tracking-[0.2em] sm:inline">
                DB-00
              </span>
            </div>
            <div className="bg-paper p-4 md:p-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {mockCards.map((card) => (
                  <div
                    key={card.label}
                    className="border-foreground bg-card border-2 p-3"
                  >
                    <p className="form-label">{card.label}</p>
                    <p className="mt-1 text-lg font-black tabular-nums">
                      {card.value}
                    </p>
                    <p className="font-mono text-[11px] font-bold uppercase">
                      {card.change}
                    </p>
                  </div>
                ))}
              </div>
              <div className="border-foreground bg-card mt-4 flex h-40 items-end gap-1.5 border-2 p-4">
                {[35, 45, 30, 55, 65, 50, 70, 60, 80, 75, 85, 90].map(
                  (h, i) => (
                    <div
                      key={i}
                      className="border-foreground bg-primary flex-1 border-2"
                      style={{ height: `${h}%` }}
                    />
                  ),
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className={`border-foreground border-2 p-4 text-center shadow-[4px_4px_0_0_var(--hard)] ${stat.tone}`}
            >
              <p className="text-3xl font-black">{stat.value}</p>
              <p className="form-label text-foreground/70 mt-1">{stat.label}</p>
            </div>
          ))}
        </section>

        {/* Features */}
        <section id="features" className="mt-10">
          <h2 className="display">O que o registro cobre</h2>
          <p className="text-muted-foreground mt-4 max-w-2xl">
            Ferramentas simples para tomar decisões financeiras melhores todos
            os dias.
          </p>

          <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <article
                key={feature.code}
                className="border-foreground border-2 shadow-[6px_6px_0_0_var(--hard)]"
              >
                <div className="strip flex items-center justify-between">
                  <span>{feature.title}</span>
                  <feature.icon className="size-4" />
                </div>
                <div className={`p-4 ${feature.tone}`}>
                  <p className="mt-2 text-sm leading-relaxed">
                    {feature.description}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {feature.tags.map((tag) => (
                      <span
                        key={tag}
                        className="bg-hard text-highlight px-1.5 py-0.5 font-mono text-[10px] tracking-wider uppercase"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="bg-hard text-highlight border-foreground mt-10 border-2 p-8 text-center shadow-[6px_6px_0_0_var(--hard)] md:p-12">
          <PiggyBank className="mx-auto size-12" />
          <h2 className="mt-4 text-3xl font-black tracking-tight uppercase md:text-4xl">
            Comece a controlar suas finanças hoje
          </h2>
          <p className="text-highlight/70 mx-auto mt-4 max-w-lg font-mono text-xs tracking-wide uppercase">
            É grátis, rápido e seguro
          </p>
          <div className="mt-8 flex justify-center">
            <Button size="lg" asChild>
              <Link href="/auth">
                criar minha conta
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </section>

        <footer className="border-foreground mt-6 flex items-center justify-between border-t-2 py-6">
          <div className="flex items-center gap-2">
            <Wallet className="size-4" />
            <span className="font-mono text-xs font-bold tracking-wider uppercase">
              onABudget
            </span>
          </div>
          <span className="form-label">
            © 2026 · TODOS OS DIREITOS RESERVADOS
          </span>
        </footer>
      </div>
    </div>
  );
}
