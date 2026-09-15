"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PiggyBank, Shield, TrendingUp, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { authClient } from "~/server/better-auth/client";

const loginSchema = z.object({
  email: z.string().email("Endereço de e-mail inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
});

type LoginFormData = z.infer<typeof loginSchema>;

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
  });

type RegisterFormData = z.infer<typeof registerSchema>;

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
];

/**
 * `signupEnabled` comes from the server page: when the deployment has closed
 * registration the tab is not rendered at all, rather than shown and then
 * refused by the auth server on submit.
 */
export function AuthForm({ signupEnabled }: { signupEnabled: boolean }) {
  const router = useRouter();
  const [loginError, setLoginError] = useState("");
  const [registerError, setRegisterError] = useState("");

  const {
    register: loginRegister,
    handleSubmit: handleLoginSubmit,
    formState: { errors: loginErrors, isSubmitting: isLoginSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const {
    register: registerRegister,
    handleSubmit: handleRegisterSubmit,
    formState: { errors: registerErrors, isSubmitting: isRegisterSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onLoginSubmit = async (data: LoginFormData) => {
    setLoginError("");

    try {
      const result = await authClient.signIn.email({
        email: data.email,
        password: data.password,
      });

      if (result.error) {
        setLoginError(result.error.message ?? "Falha ao entrar");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      console.error("Login error:", err);
      setLoginError("Ocorreu um erro inesperado");
    }
  };

  const onRegisterSubmit = async (data: RegisterFormData) => {
    setRegisterError("");

    try {
      const result = await authClient.signUp.email({
        name: data.name,
        email: data.email,
        password: data.password,
      });

      if (result.error) {
        setRegisterError(result.error.message ?? "Falha ao criar conta");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      console.error("Register error:", err);
      setRegisterError("Ocorreu um erro inesperado");
    }
  };

  return (
    <div className="flex min-h-screen">
      <div className="bg-primary text-primary-foreground border-foreground relative hidden flex-col justify-between overflow-hidden border-r-4 p-12 lg:flex lg:w-1/2">
        <div className="absolute inset-0 opacity-5">
          <svg
            className="h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <defs>
              <pattern
                id="grid"
                width="10"
                height="10"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 10 0 L 0 0 0 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="0.5"
                />
              </pattern>
            </defs>
            <rect width="100" height="100" fill="url(#grid)" />
          </svg>
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="border-foreground bg-card flex size-10 items-center justify-center border-2">
              <Wallet className="h-5 w-5" />
            </div>
            <span className="text-2xl font-black tracking-tight uppercase">
              onABudget
            </span>
          </div>
        </div>

        <div className="relative z-10 space-y-8">
          <div className="space-y-4">
            <h1 className="text-5xl leading-none font-black tracking-tight text-balance uppercase">
              Assuma o controle do seu futuro financeiro
            </h1>
            <p className="text-primary-foreground/70 max-w-md text-lg leading-relaxed">
              Junte-se a milhares de usuários que transformaram sua relação com
              o dinheiro usando nossas ferramentas intuitivas de orçamento.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="border-foreground bg-card border-2 p-4 shadow-[4px_4px_0_0_var(--hard)]"
              >
                <feature.icon className="text-foreground mb-3 h-5 w-5" />
                <h3 className="mb-1 font-mono text-xs font-bold tracking-wider uppercase">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="text-primary-foreground/50 relative z-10 text-sm">
          © 2026 onABudget. Todos os direitos reservados.
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-2 text-center lg:hidden">
            <div className="flex items-center justify-center gap-3">
              <div className="border-foreground bg-primary flex size-10 items-center justify-center border-2">
                <Wallet className="text-primary-foreground h-5 w-5" />
              </div>
              <span className="text-2xl font-black tracking-tight uppercase">
                onABudget
              </span>
            </div>
            <p className="text-muted-foreground">
              Seu Companheiro de Planejamento Financeiro
            </p>
          </div>

          <Tabs defaultValue="login" className="w-full">
            <TabsList
              className={`grid w-full gap-2 ${signupEnabled ? "grid-cols-2" : "grid-cols-1"}`}
            >
              <TabsTrigger value="login" className="h-11">
                Entrar
              </TabsTrigger>
              {signupEnabled && (
                <TabsTrigger value="register" className="h-11">
                  Criar conta
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="login" className="mt-8">
              <div className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-2xl font-black tracking-tight uppercase">
                    Bem-vindo de volta
                  </h2>
                  <p className="text-muted-foreground">
                    Digite suas credenciais para acessar sua conta
                  </p>
                </div>

                <form
                  onSubmit={handleLoginSubmit(onLoginSubmit)}
                  className="space-y-5"
                >
                  {loginError && (
                    <div className="border-destructive text-destructive bg-card border-2 p-4 font-mono text-xs uppercase">
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
                      className="bg-card h-12"
                    />
                    {loginErrors.email && (
                      <p className="text-destructive text-sm">
                        {loginErrors.email.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="login-password">Senha</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      {...loginRegister("password")}
                      disabled={isLoginSubmitting}
                      className="bg-card h-12"
                    />
                    {loginErrors.password && (
                      <p className="text-destructive text-sm">
                        {loginErrors.password.message}
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="h-12 w-full text-base font-medium"
                    disabled={isLoginSubmitting}
                  >
                    {isLoginSubmitting ? "Entrando..." : "Entrar"}
                  </Button>
                </form>
              </div>
            </TabsContent>

            {signupEnabled && (
              <TabsContent value="register" className="mt-8">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <h2 className="text-2xl font-black tracking-tight uppercase">
                      Criar uma conta
                    </h2>
                    <p className="text-muted-foreground">
                      Comece a gerenciar suas finanças de forma mais inteligente
                    </p>
                  </div>

                  <form
                    onSubmit={handleRegisterSubmit(onRegisterSubmit)}
                    className="space-y-5"
                  >
                    {registerError && (
                      <div className="border-destructive text-destructive bg-card border-2 p-4 font-mono text-xs uppercase">
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
                        className="bg-card h-12"
                      />
                      {registerErrors.name && (
                        <p className="text-destructive text-sm">
                          {registerErrors.name.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="register-email">E-mail</Label>
                      <Input
                        id="register-email"
                        type="email"
                        placeholder="joao@exemplo.com"
                        {...registerRegister("email")}
                        disabled={isRegisterSubmitting}
                        className="bg-card h-12"
                      />
                      {registerErrors.email && (
                        <p className="text-destructive text-sm">
                          {registerErrors.email.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="register-password">Senha</Label>
                      <Input
                        id="register-password"
                        type="password"
                        placeholder="••••••••"
                        {...registerRegister("password")}
                        disabled={isRegisterSubmitting}
                        className="bg-card h-12"
                      />
                      {registerErrors.password && (
                        <p className="text-destructive text-sm">
                          {registerErrors.password.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="register-confirmPassword">
                        Confirmar senha
                      </Label>
                      <Input
                        id="register-confirmPassword"
                        type="password"
                        placeholder="••••••••"
                        {...registerRegister("confirmPassword")}
                        disabled={isRegisterSubmitting}
                        className="bg-card h-12"
                      />
                      {registerErrors.confirmPassword && (
                        <p className="text-destructive text-sm">
                          {registerErrors.confirmPassword.message}
                        </p>
                      )}
                    </div>

                    <Button
                      type="submit"
                      className="h-12 w-full text-base font-medium"
                      disabled={isRegisterSubmitting}
                    >
                      {isRegisterSubmitting
                        ? "Criando conta..."
                        : "Criar conta"}
                    </Button>
                  </form>
                </div>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>
    </div>
  );
}
