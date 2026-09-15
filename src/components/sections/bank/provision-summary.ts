import type { RouterOutputs } from "~/trpc/react";

type ProvisionResult = RouterOutputs["bank"]["provisionAccounts"];

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * What provisioning did, in one line — shared by the connect flow (where it
 * runs automatically) and the button on the connection card.
 */
export function describeProvision(result: ProvisionResult): string {
  const parts: string[] = [];
  if (result.created.length > 0) {
    parts.push(plural(result.created.length, "conta criada", "contas criadas"));
  }
  if (result.linked.length > 0) {
    parts.push(
      plural(
        result.linked.length,
        "conta vinculada a uma existente",
        "contas vinculadas a contas existentes",
      ),
    );
  }
  if (result.investmentAccount) {
    parts.push(
      result.investmentAccount.created
        ? `investimentos em "${result.investmentAccount.name}" (nova)`
        : `investimentos em "${result.investmentAccount.name}"`,
    );
  }
  if (parts.length === 0) return "Nenhuma conta nova: tudo já estava vinculado";
  return parts.join(" · ");
}
