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
 *
 * ── ASE-2026-001 ────────────────────────────────────────────────────────
 *
 * The SELLING PRICE is resolved here, from products.price, and never comes
 * from the request. The client used to choose it: CreateOrderSchema
 * accepted `unit_price`, the route summed it into orders.total, and it was
 * written to order_items.unit_price. One request could therefore buy a
 * 3000 ETB product for 0.01 ETB, and that total fed revenue reporting and
 * the trg_order_delivered_commission trigger, so it also moved money to
 * affiliates. `unit_price` has been removed from the request schema; a
 * client that still sends it has it stripped rather than rejected.
 *
 * A line that cannot be matched against the catalogue has no server-side
 * price at all, and an order line cannot be priced by the client. Such a
 * line is rejected rather than accepted at zero.
 */

import type { PoolConnection } from "mysql2/promise";

export interface OrderItemInput {
  product_id?: string | undefined;
  name: string;
  package_size: string;
  quantity: number;
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
    public readonly code: "PRODUCT_NOT_FOUND" | "PRODUCT_INACTIVE" | "PRODUCT_NOT_PRICED",
    message: string
  ) {
    super(message);
    this.name = "OrderItemResolutionError";
  }
}

type Queryable = Pick<PoolConnection, "query">;

/**
 * Reads the selling price off a catalogue row.
 *
 * A product with no price cannot be sold, and a zero price is a real price
 * (a free sample, say), so only NULL is refused.
 */
function cataloguePrice(product: any): number {
  if (product.price === null || product.price === undefined) {
    throw new OrderItemResolutionError(
      "PRODUCT_NOT_PRICED",
      `Product "${product.name}" (${product.package_size}) has no price set and cannot be ordered.`
    );
  }
  return Number(product.price);
}

export async function resolveOrderItem(
  conn: Queryable,
  item: OrderItemInput
): Promise<ResolvedOrderItem> {
  if (item.product_id) {
    const [rows] = await conn.query(
      `SELECT id, name, package_size, unit_cost, price, active
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
      unitPrice: cataloguePrice(product),
      unitCost: Number(product.unit_cost ?? 0),
    };
  }

  // Legacy fallback: exact name + size. Inactive rows are matched too, so
  // that a discontinued product is refused as discontinued rather than
  // reported as missing.
  const [rows] = await conn.query(
    `SELECT id, name, package_size, unit_cost, price, active
     FROM products
     WHERE LOWER(name) = LOWER(?)
       AND package_size = ?
     ORDER BY id
     LIMIT 1`,
    [item.name, item.package_size]
  ) as [any[], any];

  const product = rows[0];
  if (!product) {
    // There is no catalogue price for this line, and the client may not
    // supply one. Refuse rather than price it at zero.
    throw new OrderItemResolutionError(
      "PRODUCT_NOT_FOUND",
      `"${item.name}" (${item.package_size}) is not in the catalogue and cannot be ordered.`
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
    unitPrice: cataloguePrice(product),
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
