export const ALLOWED_TAGS = ["Traditional", "Herbs", "Oils", "Superfood", "Other"];

export function normalizeKey(name: string, size: string): string {
  const normName = name.toLowerCase().replace(/\s+/g, '');
  const normSize = size.toLowerCase().replace(/\s+/g, '');
  return `${normName}|${normSize}`;
}

type QueryFn = (sql: string, params: any[]) => Promise<any>;

export async function isDuplicate(
  queryFn: QueryFn,
  name: string,
  size: string,
  excludeId?: string
): Promise<boolean> {
  const normName = name.toLowerCase().replace(/\s+/g, '');
  const normSize = size.toLowerCase().replace(/\s+/g, '');
  
  let sql = `SELECT id, name, package_size FROM products WHERE active = true`;
  const params: any[] = [];
  if (excludeId) {
    sql += ` AND id != ?`;
    params.push(excludeId);
  }
  
  const rows = await queryFn(sql, params);
  for (const row of rows) {
    if (
      row.name.toLowerCase().replace(/\s+/g, '') === normName &&
      row.package_size.toLowerCase().replace(/\s+/g, '') === normSize
    ) {
      return true;
    }
  }
  return false;
}

export function mergedActive(fieldsActive: any, dbActive: any): boolean {
  if (fieldsActive !== undefined) {
    return !(fieldsActive === 0 || fieldsActive === "0" || fieldsActive === false || fieldsActive === "false");
  }
  return !(dbActive === 0 || dbActive === "0" || dbActive === false || dbActive === "false");
}
