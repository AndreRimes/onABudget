import { eq, desc, like, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { assetTypes } from "~/server/db/schema";
import { investmentTransactions } from "~/server/db/schema";

export type AssetTypeInsert = typeof assetTypes.$inferInsert;
export type AssetType = typeof assetTypes.$inferSelect;

export type CreateAssetTypeInput = {
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
  async findById(id: number): Promise<AssetType | undefined> {
    return await db.query.assetTypes.findFirst({
      where: eq(assetTypes.id, id),
    });
  }

  /**
   * Get asset type by name
   */
  async findByName(name: string): Promise<AssetType | undefined> {
    return await db.query.assetTypes.findFirst({
      where: eq(assetTypes.name, name),
    });
  }

  /**
   * Get all asset types
   */
  async findAll(): Promise<AssetType[]> {
    return await db.query.assetTypes.findMany({
      orderBy: [desc(assetTypes.createdAt)],
    });
  }

  /**
   * Search asset types by name
   */
  async search(query: string): Promise<AssetType[]> {
    return await db
      .select()
      .from(assetTypes)
      .where(like(assetTypes.name, `%${query}%`))
      .orderBy(assetTypes.name);
  }

  /**
   * Update an asset type
   */
  async update(
    id: number,
    values: Partial<CreateAssetTypeInput>,
  ): Promise<AssetType | undefined> {
    const [updated] = await db
      .update(assetTypes)
      .set(values)
      .where(eq(assetTypes.id, id))
      .returning();

    return updated;
  }

  /**
   * Delete an asset type
   */
  async delete(id: number): Promise<boolean> {
    const result = await db
      .delete(assetTypes)
      .where(eq(assetTypes.id, id))
      .returning();

    return result.length > 0;
  }

  /**
   * Check if asset type exists by name
   */
  async exists(name: string): Promise<boolean> {
    const assetType = await this.findByName(name);
    return !!assetType;
  }
  async findAllWithStats(): Promise<
    Array<AssetType & { transactionCount: number }>
  > {
    const result = await db
      .select({
        id: assetTypes.id,
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
      .groupBy(assetTypes.id);

    return result;
  }
}

// Export singleton instance
export const assetTypeRepository = new AssetTypeRepository();
