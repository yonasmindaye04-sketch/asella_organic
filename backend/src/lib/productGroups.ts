/**
 * src/lib/productGroups.ts
 * Helpers for the product_groups parent table.
 *
 * products.name is kept for backward compatibility and order snapshots;
 * product_groups.name is the canonical display name. New variants are
 * attached to a group by product_group_id, or to an existing group with the
 * same name, or to a new single-variant group.
 */

import crypto from "crypto";
import type { PoolConnection } from "mysql2/promise";

type Queryable = Pick<PoolConnection, "query">;

export interface ProductGroupInput {
  product_group_id?: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  featured?: boolean | number;
  tag?: string | null;
  active?: boolean | number;
}

export interface ProductGroupRef {
  id: string;
  name: string;
}

export class ProductGroupError extends Error {
  constructor(
    public readonly code: "GROUP_NOT_FOUND" | "GROUP_NAME_CONFLICT",
    message: string
  ) {
    super(message);
    this.name = "ProductGroupError";
  }
}

export function slugifyProductName(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 180) || "product"
  );
}

async function uniqueSlug(
  conn: Queryable,
  name: string,
  excludeGroupId?: string
): Promise<string> {
  const base = slugifyProductName(name);
  let slug = base;

  for (let suffix = 2; suffix <= 50; suffix++) {
    const [rows] = await conn.query(
      excludeGroupId
        ? `SELECT id FROM product_groups WHERE slug = ? AND id <> ? LIMIT 1`
        : `SELECT id FROM product_groups WHERE slug = ? LIMIT 1`,
      excludeGroupId ? [slug, excludeGroupId] : [slug]
    ) as [any[], any];

    if (!rows[0]) return slug;
    slug = `${base}-${suffix}`;
  }

  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

/**
 * Return the group a new variant belongs to.
 *
 * - product_group_id wins when supplied.
 * - Otherwise an existing group with the same (case-insensitive) name is
 *   reused, so adding a second size from the current product form works.
 * - Otherwise a new group is created.
 */
export async function ensureProductGroup(
  conn: Queryable,
  input: ProductGroupInput
): Promise<ProductGroupRef> {
  if (input.product_group_id) {
    const [rows] = await conn.query(
      `SELECT id, name FROM product_groups WHERE id = ? LIMIT 1`,
      [input.product_group_id]
    ) as [any[], any];

    if (!rows[0]) {
      throw new ProductGroupError(
        "GROUP_NOT_FOUND",
        "The selected product group does not exist."
      );
    }
    return { id: rows[0].id as string, name: rows[0].name as string };
  }

  const [existing] = await conn.query(
    `SELECT id, name FROM product_groups WHERE LOWER(name) = LOWER(?) LIMIT 1`,
    [input.name]
  ) as [any[], any];

  if (existing[0]) {
    return { id: existing[0].id as string, name: existing[0].name as string };
  }

  const id = crypto.randomUUID();
  const slug = await uniqueSlug(conn, input.name);

  await conn.query(
    `INSERT INTO product_groups
       (id, name, slug, description, image_url, featured, tag, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      slug,
      input.description ?? null,
      input.image_url ?? null,
      input.featured ? 1 : 0,
      input.tag ?? "",
      input.active === undefined ? 1 : input.active ? 1 : 0,
    ]
  );

  return { id, name: input.name };
}

/**
 * Rename the parent and every variant that belongs to it. This keeps
 * products.name aligned with product_groups.name.
 */
export async function renameProductGroup(
  conn: Queryable,
  groupId: string,
  newName: string
): Promise<void> {
  const [conflict] = await conn.query(
    `SELECT id FROM product_groups
     WHERE LOWER(name) = LOWER(?) AND id <> ?
     LIMIT 1`,
    [newName, groupId]
  ) as [any[], any];

  if (conflict[0]) {
    throw new ProductGroupError(
      "GROUP_NAME_CONFLICT",
      "A product group with this name already exists. Rename the variant or move it to that group instead."
    );
  }

  const slug = await uniqueSlug(conn, newName, groupId);

  await conn.query(
    `UPDATE product_groups SET name = ?, slug = ? WHERE id = ?`,
    [newName, slug, groupId]
  );
  await conn.query(
    `UPDATE products SET name = ? WHERE product_group_id = ?`,
    [newName, groupId]
  );
}

/** A group is active while at least one of its variants is active. */
export async function syncGroupAfterVariantChange(
  conn: Queryable,
  groupId: string
): Promise<void> {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS active_count
     FROM products
     WHERE product_group_id = ? AND active = 1`,
    [groupId]
  ) as [any[], any];

  const active = Number(rows[0]?.active_count ?? 0) > 0 ? 1 : 0;
  await conn.query(
    `UPDATE product_groups SET active = ? WHERE id = ?`,
    [active, groupId]
  );
}
