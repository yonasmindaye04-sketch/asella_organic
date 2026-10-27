/**
 * src/lib/orderItems.ts
 * Resolve order-item input against the catalog.
 *
 * New clients send product_id (the products.id of the variant). Legacy
 * clients and the Telegram bot still send name/package_size, so a narrow
 * exact-name fallback is kept for them.
 *
 * A product_id that does not exist, or points at an inactive variant, is
 * rejected. Silently accepting it would create an unlinked order line and
 * hide a catalog bug.
 */

import type { PoolConnection } from "mysql2/promise";

export interface OrderItemInput {
  product_id?: string | undefined;
  name: string;
  package_size: string;
  quantity: number;
  unit_price: number;
}

export interface ResolvedOrderItem {
  productId: string | null;
  name: string;
  packageSize: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
}

export class OrderItemResolutionError extends Error {
  constructor(
    public readonly code: "PRODUCT_NOT_FOUND" | "PRODUCT_INACTIVE",
    message: string
  ) {
    super(message);
    this.name = "OrderItemResolutionError";
  }
}

type Queryable = Pick<PoolConnection, "query">;

export async function resolveOrderItem(
  conn: Queryable,
  item: OrderItemInput
): Promise<ResolvedOrderItem> {
  if (item.product_id) {
    const [rows] = await conn.query(
      `SELECT id, name, package_size, unit_cost, active
       FROM products
       WHERE id = ?
       LIMIT 1`,
      [item.product_id]
    ) as [any[], any];

    const product = rows[0];
    if (!product) {
      throw new OrderItemResolutionError(
        "PRODUCT_NOT_FOUND",
        `Product ${item.product_id} was not found.`
      );
    }
    if (!product.active) {
      throw new OrderItemResolutionError(
        "PRODUCT_INACTIVE",
        `Product "${product.name}" (${product.package_size}) is inactive and cannot be ordered.`
      );
    }

    return {
      productId: product.id as string,
      name: product.name as string,
      packageSize: product.package_size as string,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      unitCost: Number(product.unit_cost ?? 0),
    };
  }

  // Legacy fallback: exact active name + size. If it does not match, keep the
  // line as a custom/unlinked item rather than guessing at a different size.
  const [rows] = await conn.query(
    `SELECT id, name, package_size, unit_cost
     FROM products
     WHERE active = 1
       AND LOWER(name) = LOWER(?)
       AND package_size = ?
     ORDER BY id
     LIMIT 1`,
    [item.name, item.package_size]
  ) as [any[], any];

  const product = rows[0];
  if (!product) {
    return {
      productId: null,
      name: item.name,
      packageSize: item.package_size,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      unitCost: 0,
    };
  }

  return {
    productId: product.id as string,
    name: product.name as string,
    packageSize: product.package_size as string,
    quantity: item.quantity,
    unitPrice: item.unit_price,
    unitCost: Number(product.unit_cost ?? 0),
  };
}

export async function resolveOrderItems(
  conn: Queryable,
  items: OrderItemInput[]
): Promise<ResolvedOrderItem[]> {
  const resolved: ResolvedOrderItem[] = [];
  for (const item of items) {
    resolved.push(await resolveOrderItem(conn, item));
  }
  return resolved;
}
