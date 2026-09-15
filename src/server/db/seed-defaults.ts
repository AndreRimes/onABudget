// Starter categories and asset types for a brand new account.
//
// Before migration 0014 both tables were global, so the first user's rows
// doubled as everybody's defaults. Now that they are owned, a fresh account
// would open every picker empty — and an empty picker blocks the import flows
// outright, since a statement row cannot be filed without a category and a
// trade cannot be recorded without an asset type.
import { db } from "~/server/db";
import { assetTypes, expenseCategories } from "~/server/db/schema";

const DEFAULT_CATEGORIES: Array<{ name: string; color: string }> = [
  { name: "Alimentação", color: "#F97316" },
  { name: "Transporte", color: "#0EA5E9" },
  { name: "Moradia", color: "#8B5CF6" },
  { name: "Saúde", color: "#EF4444" },
  { name: "Educação", color: "#14B8A6" },
  { name: "Lazer", color: "#EC4899" },
  { name: "Assinaturas", color: "#6366F1" },
  { name: "Outros", color: "#64748B" },
];

/**
 * These names are deliberately the exact strings `pluggyAssetTypeLabel`
 * produces (see `~/server/api/bank/asset-type`). A seeded "Ações" is what an
 * Open Finance sync then matches against, instead of creating a second type
 * beside it on the first import.
 */
const DEFAULT_ASSET_TYPES: Array<{ name: string; description: string }> = [
  { name: "Ações", description: "Ações negociadas em bolsa" },
  { name: "FIIs", description: "Fundos de investimento imobiliário" },
  { name: "ETFs", description: "Fundos de índice" },
  { name: "BDRs", description: "Recibos de ações estrangeiras" },
  { name: "Renda Fixa", description: "CDB, LCI, LCA, debêntures" },
  { name: "Tesouro Direto", description: "Títulos públicos federais" },
  { name: "Fundos", description: "Fundos de investimento" },
];

/**
 * Idempotent: every insert is guarded by the per-user unique index, so calling
 * this twice (a retried sign-up, a hook that fires again) adds nothing and a
 * name the user has since renamed or deleted is not resurrected — only a name
 * they do not currently have can be inserted at all.
 */
export async function seedDefaultsForUser(userId: string): Promise<void> {
  await db
    .insert(expenseCategories)
    .values(
      DEFAULT_CATEGORIES.map((category) => ({
        userId,
        name: category.name,
        color: category.color,
      })),
    )
    .onConflictDoNothing({
      target: [expenseCategories.userId, expenseCategories.name],
    });

  await db
    .insert(assetTypes)
    .values(
      DEFAULT_ASSET_TYPES.map((type) => ({
        userId,
        name: type.name,
        description: type.description,
      })),
    )
    .onConflictDoNothing({ target: [assetTypes.userId, assetTypes.name] });
}
