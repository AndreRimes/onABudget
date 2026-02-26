"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { PiggyBank, Shield, TrendingUp, Wallet } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { authClient } from "~/server/better-auth/client"

const loginSchema = z.object({
  email: z.string().email("Endereço de e-mail inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
})

type LoginFormData = z.infer<typeof loginSchema>

const registerSchema = z
  .object({
    name: z.string().min(1, "Nome é obrigatório"),
    email: z.string().email("Endereço de e-mail inválido"),
    password: z
      .string()
      .min(8, "A senha deve ter pelo menos 8 caracteres")
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        "A senha deve conter pelo menos uma letra maiúscula, uma minúscula e um número",
      ),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  })

type RegisterFormData = z.infer<typeof registerSchema>

const features = [
  {
    icon: PiggyBank,
    title: "Economias Inteligentes",
    description: "Metas de economia automatizadas que crescem com você",
  },
  {
    icon: TrendingUp,
    title: "Controle de Gastos",
    description: "Visualize para onde seu dinheiro vai",
  },
  {
    icon: Shield,
    title: "Segurança Bancária",
    description: "Seus dados são criptografados e protegidos",
  },
  {
    icon: Wallet,
    title: "Planejamento de Orçamento",
    description: "Crie orçamentos que realmente funcionam",
  },
]

export default function AuthPage() {
  const router = useRouter()
  const [loginError, setLoginError] = useState("")
  const [registerError, setRegisterError] = useState("")

  const {
    register: loginRegister,
    handleSubmit: handleLoginSubmit,
    formState: { errors: loginErrors, isSubmitting: isLoginSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  const {
    register: registerRegister,
    handleSubmit: handleRegisterSubmit,
    formState: { errors: registerErrors, isSubmitting: isRegisterSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  })

  const onLoginSubmit = async (data: LoginFormData) => {
    setLoginError("")

    try {
      const result = await authClient.signIn.email({
        email: data.email,
        password: data.password,
      })

      if (result.error) {
        setLoginError(result.error.message ?? "Falha ao entrar")
        return
      }

      router.push("/dashboard")
      router.refresh()
    } catch (err) {
      console.error("Login error:", err)
      setLoginError("Ocorreu um erro inesperado")
    }
  }

  const onRegisterSubmit = async (data: RegisterFormData) => {
    setRegisterError("")

    try {
      const result = await authClient.signUp.email({
        name: data.name,
        email: data.email,
        password: data.password,
      })

      if (result.error) {
        setRegisterError(result.error.message ?? "Falha ao criar conta")
        return
      }

      router.push("/dashboard")
      router.refresh()
    } catch (err) {
      console.error("Register error:", err)
      setRegisterError("Ocorreu um erro inesperado")
    }
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden lg:flex lg:w-1/2 bg-primary text-primary-foreground flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M 10 0 L 0 0 0 10" fill="none" stroke="currentColor" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100" height="100" fill="url(#grid)" />
          </svg>
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-foreground/10 flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
            <span className="text-2xl font-bold tracking-tight">onABudget</span>
          </div>
        </div>

        <div className="relative z-10 space-y-8">
          <div className="space-y-4">
            <h1 className="text-5xl font-bold leading-tight tracking-tight text-balance">
              Assuma o controle do seu futuro financeiro
            </h1>
            <p className="text-lg text-primary-foreground/70 max-w-md leading-relaxed">
              Junte-se a milhares de usuários que transformaram sua relação com o dinheiro usando nossas ferramentas
              intuitivas de orçamento.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="p-4 rounded-xl bg-primary-foreground/5 border border-primary-foreground/10 backdrop-blur-sm"
              >
                <feature.icon className="w-5 h-5 mb-3 text-accent" />
                <h3 className="font-semibold mb-1">{feature.title}</h3>
                <p className="text-sm text-primary-foreground/60">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-sm text-primary-foreground/50">© 2026 onABudget. Todos os direitos reservados.</div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-8">
          <div className="lg:hidden text-center space-y-2">
            <div className="flex items-center justify-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <Wallet className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-2xl font-bold tracking-tight">onABudget</span>
            </div>
            <p className="text-muted-foreground">Seu Companheiro de Planejamento Financeiro</p>
          </div>

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 h-12 p-1 bg-secondary">
              <TabsTrigger
                value="login"
                className="text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm"
              >
                Entrar
              </TabsTrigger>
              <TabsTrigger
                value="register"
                className="text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm"
              >
                Criar conta
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-8">
              <div className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold tracking-tight">Bem-vindo de volta</h2>
                  <p className="text-muted-foreground">Digite suas credenciais para acessar sua conta</p>
                </div>

                <form onSubmit={handleLoginSubmit(onLoginSubmit)} className="space-y-5">
                  {loginError && (
                    <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                      {loginError}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="login-email">E-mail</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="joao@exemplo.com"
                      {...loginRegister("email")}
                      disabled={isLoginSubmitting}
                      className="h-12 bg-card"
                    />
                    {loginErrors.email && <p className="text-sm text-destructive">{loginErrors.email.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="login-password">Senha</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      {...loginRegister("password")}
                      disabled={isLoginSubmitting}
                      className="h-12 bg-card"
                    />
                    {loginErrors.password && <p className="text-sm text-destructive">{loginErrors.password.message}</p>}
                  </div>

                  <Button type="submit" className="w-full h-12 text-base font-medium" disabled={isLoginSubmitting}>
                    {isLoginSubmitting ? "Entrando..." : "Entrar"}
                  </Button>
                </form>
              </div>
            </TabsContent>

            <TabsContent value="register" className="mt-8">
              <div className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold tracking-tight">Criar uma conta</h2>
                  <p className="text-muted-foreground">Comece a gerenciar suas finanças de forma mais inteligente</p>
                </div>

                <form onSubmit={handleRegisterSubmit(onRegisterSubmit)} className="space-y-5">
                  {registerError && (
                    <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                      {registerError}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="register-name">Nome completo</Label>
                    <Input
                      id="register-name"
                      type="text"
                      placeholder="João da Silva"
                      {...registerRegister("name")}
                      disabled={isRegisterSubmitting}
                      className="h-12 bg-card"
                    />
                    {registerErrors.name && <p className="text-sm text-destructive">{registerErrors.name.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-email">E-mail</Label>
                    <Input
                      id="register-email"
                      type="email"
                      placeholder="joao@exemplo.com"
                      {...registerRegister("email")}
                      disabled={isRegisterSubmitting}
                      className="h-12 bg-card"
                    />
                    {registerErrors.email && <p className="text-sm text-destructive">{registerErrors.email.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-password">Senha</Label>
                    <Input
                      id="register-password"
                      type="password"
                      placeholder="••••••••"
                      {...registerRegister("password")}
                      disabled={isRegisterSubmitting}
                      className="h-12 bg-card"
                    />
                    {registerErrors.password && (
                      <p className="text-sm text-destructive">{registerErrors.password.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-confirmPassword">Confirmar senha</Label>
                    <Input
                      id="register-confirmPassword"
                      type="password"
                      placeholder="••••••••"
                      {...registerRegister("confirmPassword")}
                      disabled={isRegisterSubmitting}
                      className="h-12 bg-card"
                    />
                    {registerErrors.confirmPassword && (
                      <p className="text-sm text-destructive">{registerErrors.confirmPassword.message}</p>
                    )}
                  </div>

                  <Button type="submit" className="w-full h-12 text-base font-medium" disabled={isRegisterSubmitting}>
                    {isRegisterSubmitting ? "Criando conta..." : "Criar conta"}
                  </Button>
                </form>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
