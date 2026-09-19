import type { ReconciliationCause } from "~/server/api/investments/reconcile";

/** What the mismatch means, in the terms that decide what to do about it. */
export const CAUSE_LABEL: Partial<Record<ReconciliationCause, string>> = {
  quantity: "Quantidade diferente",
  price: "Preço diferente",
  gain: "Rentabilidade diferente",
};

export const CAUSE_HINT: Partial<Record<ReconciliationCause, string>> = {
  quantity:
    "O histórico importado não cobre toda a posição — compras anteriores à janela do Open Finance. Lance a diferença à mão ou use a posição inicial na sincronização.",
  price:
    "Mesma quantidade dos dois lados, valores diferentes: a cota ou a cotação usada aqui é de outro dia, ou o banco já desconta o IR provisionado.",
  gain: "Posição e valor batem, mas o ganho não: os preços de compra registrados aqui não são os que o banco tem. Confira as transações desses ativos — o preço médio e a rentabilidade saem errados mesmo com o total certo.",
};

export function formatQuantity(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 }).format(
    value,
  );
}
