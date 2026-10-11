/**
 * backend/src/lib/ids.ts
 * Asella Organic — Entity id validation
 *
 * Every id-bearing table in this schema is `CHAR(36) DEFAULT (UUID())`, but
 * rows are not exclusively written by that default. The import writes
 * prefixed, still-36-character identifiers:
 *
 *   customers           cu000034-0000-0000-0000-000000000034
 *   products            pr000001-0000-0000-0000-000000000001
 *   customer_ratings    rat00001-0000-0000-0000-000000000008
 *   staff_users         a0000001-0000-0000-0000-000000000001
 *   affiliate_profiles  af000001-0000-0000-0000-000000000001
 *
 * A hex-UUID regex silently rejects any of those whose prefix is not made of
 * hex digits — `cu`, `pr` and `rat` all fail. That is not hypothetical: it
 * made every real customer 404 in the Customers drawer while the few seeded
 * UUID() rows still resolved, so the failure looked data-dependent.
 *
 * This module is the single place that decides what a valid id looks like.
 * Routes must not re-declare their own regex: four copies of this check had
 * already drifted, which is how one of them ended up wrong.
 *
 * Quoting is not the threat model. Every query in this codebase is
 * parameterised, so a permissive charset cannot introduce injection. The check
 * exists so that junk input produces a clean 400/404 instead of a database
 * error, and so that ids stay free of path separators and wildcards.
 */

/**
 * Bounded, separator-only identifier: letters, digits, hyphen, underscore.
 *
 * Upper bound of 64 comfortably covers the 36-character schema width while
 * still rejecting unbounded input. Excluding `.` `/` `\` `%` `*` and
 * whitespace also rules out path traversal and LIKE-wildcard injection in the
 * handful of places ids are interpolated into a LIKE clause.
 */
const ENTITY_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * True when `value` is a well-formed entity id.
 *
 * Accepts genuine UUIDs and every prefixed scheme above; rejects quotes,
 * spaces, slashes and SQL wildcards.
 */
export function isEntityId(value: unknown): value is string {
  return typeof value === "string" && ENTITY_ID_RE.test(value);
}

/**
 * Read an Express route param that may arrive as a string or, under some
 * Express versions and wildcard routes, as a single-element array.
 *
 * Returns null when the param is missing or malformed, so callers can respond
 * with 404 rather than forwarding junk into a query.
 */
export function entityIdParam(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return isEntityId(raw) ? raw : null;
}