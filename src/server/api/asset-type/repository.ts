// Every method is scoped by owner — see the note in the category repository.
// Asset types were global until migration 0014.
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { accounts, assetTypes } from "~/server/db/schema";
import { investmentTransactions } from "~/server/db/schema";

export type AssetTypeInsert = typeof assetTypes.$inferInsert;
export type AssetType = typeof assetTypes.$inferSelect;

export type CreateAssetTypeInput = {
  userId: string;
  name: string;
  description?: string;
};

export class AssetTypeRepository {
  /**
   * Create a new asset type
   */
  async create(values: CreateAssetTypeInput): Promise<AssetType> {
    const [assetType] = await db.insert(assetTypes).values(values).returning();

    return assetType!;
  }

  /**
   * Get asset type by ID
   */
  async findById(userId: string, id: number): Promise<AssetType | undefined> {
    return await db.query.assetTypes.findFirst({
      where: and(eq(assetTypes.id, id), eq(assetTypes.userId, userId)),
    });
  }

  /**
   * Get asset type by name
   */
  async findByName(
    userId: string,
    name: string,
  ): Promise<AssetType | undefined> {
    return await db.query.assetTypes.findFirst({
      where: and(eq(assetTypes.name, name), eq(assetTypes.userId, userId)),
    });
  }

  /**
   * Get all asset types
   */
  async findAll(userId: string): Promise<AssetType[]> {
    return await db.query.assetTypes.findMany({
      where: eq(assetTypes.userId, userId),
      orderBy: [asc(assetTypes.name)],
    });
  }

  /**
   * Search asset types by name
   */
  async search(userId: string, query: string): Promise<AssetType[]> {
    // `%` and `_` are LIKE wildcards; a user typing them is looking for the
    // characters themselves, not for "everything".
    const escaped = query.replace(/[\\%_]/g, (char) => `\\${char}`);
    return await db
      .select()
      .from(assetTypes)
      .where(
        and(
          eq(assetTypes.userId, userId),
          sql`${assetTypes.name} LIKE ${`%${escaped}%`} ESCAPE '\\'`,
        ),
      )
      .orderBy(assetTypes.name);
  }

  /**
   * True when every id belongs to the user — the asset-type counterpart of
   * `categoryRepository.ownsAll`. Every write taking an `assetTypeId` from the
   * client (create, update, the B3 import) must pass through here.
   */
  async ownsAll(userId: string, ids: number[]): Promise<boolean> {
    const wanted = [...new Set(ids)];
    if (wanted.length === 0) return true;
    const rows = await db
      .select({ id: assetTypes.id })
      .from(assetTypes)
      .where(
        and(eq(assetTypes.userId, userId), inArray(assetTypes.id, wanted)),
      );
    return rows.length === wanted.length;
  }

  /**
   * Update an asset type
   */
  async update(
    userId: string,
    id: number,
    values: Partial<Omit<CreateAssetTypeInput, "userId">>,
  ): Promise<AssetType | undefined> {
    const [updated] = await db
      .update(assetTypes)
      .set(values)
      .where(and(eq(assetTypes.id, id), eq(assetTypes.userId, userId)))
      .returning();

    return updated;
  }

  /**
   * Delete an asset type
   */
  async delete(userId: string, id: number): Promise<boolean> {
    const result = await db
      .delete(assetTypes)
      .where(and(eq(assetTypes.id, id), eq(assetTypes.userId, userId)))
      .returning();

    return result.length > 0;
  }

  /**
   * Check if asset type exists by name
   */
  async exists(userId: string, name: string): Promise<boolean> {
    const assetType = await this.findByName(userId, name);
    return !!assetType;
  }

  async findAllWithStats(
    userId: string,
  ): Promise<Array<AssetType & { transactionCount: number }>> {
    const result = await db
      .select({
        id: assetTypes.id,
        userId: assetTypes.userId,
        name: assetTypes.name,
        description: assetTypes.description,
        createdAt: assetTypes.createdAt,
        transactionCount: sql<number>`COUNT(${investmentTransactions.id})`.as(
          "transaction_count",
        ),
      })
      .from(assetTypes)
      .leftJoin(
        investmentTransactions,
        eq(assetTypes.id, investmentTransactions.assetTypeId),
      )
      // The account join keeps the count honest: a type only ever counts
      // transactions held in its owner's own investment accounts.
      .leftJoin(
        accounts,
        and(
          eq(accounts.id, investmentTransactions.investmentAccountId),
          eq(accounts.userId, userId),
        ),
      )
      .where(eq(assetTypes.userId, userId))
      .groupBy(assetTypes.id)
      .orderBy(assetTypes.name);

    return result;
  }
}

// Export singleton instance
export const assetTypeRepository = new AssetTypeRepository();
