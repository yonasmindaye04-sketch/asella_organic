#!/usr/bin/env node
/*
 * generate-legacy-decisions.cjs
 *
 * Generates catalog-legacy-decisions.csv from the production audit table.
 * The rows and counts are copied from the 2026-10-26 production audit.
 * Re-run this after a fresh audit if the legacy set changes.
 */

const fs = require("fs");
const path = require("path");

const rows = [
  r("Kerebe (Myrrh) Oil", "30ml", 150, 32, 118, 0, "Kerebe (Myrrh) Oil", "30ml", "MAP", "exact", "high", "32 NULL links; 118 already active"),
  r("Moringa powder", "1kg", 145, 44, 101, 0, "Moringa powder", "1kg", "MAP", "exact", "high", "44 NULL links"),
  r("Hibscus Dry Leafe", "200g", 84, 37, 47, 0, "Hibscus Dry Leafe", "200g", "MAP", "exact", "high", "37 NULL links; production name is Hibscus Dry Leafe"),
  r("Ashewagenda (himalya) Tablet", "60 Tablet", 82, 19, 63, 0, "Ashewagenda (Himalya) Tablet", "60 Tablet", "MAP", "normalized", "high", "19 NULL links; case-only difference"),
  r("Moringa powder", "500g", 80, 19, 61, 0, "Moringa powder", "500g", "MAP", "exact", "high", "19 NULL links"),
  r("Chia Seed", "250g", 67, 26, 41, 0, "Chia Seed", "250g", "MAP", "exact", "high", "26 NULL links"),
  r("Chia Seed", "250 g", 62, 0, 0, 62, "Chia Seed", "250g", "MAP", "normalized", "high", "62 inactive links; space-only difference"),
  r("Kerebe (myrrh) Oil", "60ml", 55, 12, 43, 0, "Kerebe (Myrrh) Oil", "60ml", "MAP", "normalized", "high", "12 NULL links; case-only difference"),
  r("Chebe Powder", "100g", 55, 17, 38, 0, "Chebe Powder", "100g", "MAP", "exact", "high", "17 NULL links"),
  r("Shilajit Capsules", "60 capsules", 54, 0, 0, 54, "Shilajit Tablet", "60 Tablet", "REVIEW", "rename", "medium", "54 inactive; capsule-to-tablet form change; business must confirm"),
  r("Shilajit Tablet", "60 Tablet", 52, 11, 41, 0, "Shilajit Tablet", "60 Tablet", "MAP", "exact", "high", "11 NULL links"),
  r("Moringa Powder", "200g", 50, 18, 32, 0, "Moringa powder", "200g", "MAP", "normalized", "high", "18 NULL links; case-only difference"),
  r("Kesil Powder", "200g", 49, 13, 36, 0, "Kesil Powder", "200g", "MAP", "exact", "high", "13 NULL links"),
  r("Moringa Powder", "1 kg", 49, 0, 0, 49, "Moringa powder", "1kg", "MAP", "normalized", "high", "49 inactive links; space-only difference"),
  r("Cloves", "100g", 46, 13, 19, 14, "Cloves", "100g", "MAP", "exact", "high", "13 NULL + 14 inactive; one active SKU"),
  r("Hibscus Dry Leafe", "400g", 45, 0, 45, 0, "Hibscus Dry Leafe", "400g", "NO_ACTION", "exact", "high", "45 already active"),
  r("Asella Kerbe Raw", "100g", 44, 14, 30, 0, "Asella Kerbe Raw", "100g", "MAP", "exact", "high", "14 NULL links"),
  r("Kerebe (Myrrh )  Oil", "30 ml", 43, 0, 0, 43, "Kerebe (Myrrh) Oil", "30ml", "MAP", "normalized", "high", "43 inactive links; spacing difference"),
  r("Nila Powder", "100g", 43, 14, 26, 3, "Nila Powder", "100g", "MAP", "exact", "high", "14 NULL + 3 inactive"),
  r("Erde", "200g", 40, 13, 27, 0, "Erde", "200g", "MAP", "exact", "high", "13 NULL links"),
  r("Hibiscus Dry Leaf", "100 g", 37, 0, 0, 37, "Hibscus Dry Leafe", "100g", "REVIEW", "rename", "medium", "37 inactive; spelling and Hibiscus/Kerkede naming; confirm"),
  r("Pumpkin Seed", "300g", 36, 6, 30, 0, "Pumpkin Seed", "300g", "MAP", "exact", "high", "6 NULL links"),
  r("Moringa Powder", "500 g", 36, 0, 0, 36, "Moringa powder", "500g", "MAP", "normalized", "high", "36 inactive links; space-only difference"),
  r("Ashewagenda Powder", "300g", 36, 10, 26, 0, "Ashewagenda powder", "300g", "MAP", "normalized", "high", "10 NULL links; case-only difference"),
  r("Hibscus Dry Leafe", "100g", 34, 17, 17, 0, "Hibscus Dry Leafe", "100g", "MAP", "exact", "high", "17 NULL links"),
  r("Hibiscus Dry Leaf", "200 g", 32, 0, 0, 32, "Hibscus Dry Leafe", "200g", "REVIEW", "rename", "medium", "32 inactive; spelling and Hibiscus/Kerkede naming; confirm"),
  r("Ashwagandha Tablet (Himalayan)", "60 capsules", 31, 0, 0, 31, "Ashewagenda (Himalya) Tablet", "60 Tablet", "REVIEW", "rename", "medium", "31 inactive; form/name change; confirm"),
  r("Chia Seed", "1kg", 31, 7, 24, 0, "Chia Seed", "1kg", "MAP", "exact", "high", "7 NULL links"),
  r("Moringa Powder", "200 g", 31, 0, 0, 31, "Moringa powder", "200g", "MAP", "normalized", "high", "31 inactive links; space-only difference"),
  r("Frankincense Oil", "30ml", 29, 7, 22, 0, "Frankincense Oil", "30ml", "MAP", "exact", "high", "7 NULL links"),
  r("Pumpkin Seed", "100g", 26, 5, 0, 21, "Pumpkin Seed", "300g", "REVIEW", "size_substitution", "low", "Production only has Pumpkin Seed 300g; confirm 100g -> 300g substitution"),
  r("Cinnamon", "100g", 26, 10, 16, 0, "Cinnamon", "100g", "MAP", "exact", "high", "10 NULL links"),
  r("Chia Seed", "1 kg", 24, 0, 0, 24, "Chia Seed", "1kg", "MAP", "normalized", "high", "24 inactive links; space-only difference"),
  r("Kerbe Powder", "100g", 21, 7, 14, 0, "Kerbe Powder", "100g", "MAP", "exact", "high", "7 NULL links"),
  r("Qasil Powder", "200 g", 20, 0, null, null, "Kesil Powder", "200g", "REVIEW", "rename", "medium", "20 with no active link; Qasil/Kesil rename; confirm"),
  r("Chebe Powder", "100 g", 17, 0, 0, 17, "Chebe Powder", "100g", "MAP", "normalized", "high", "17 inactive links; space-only difference"),
  r("Myrrh  Kerebe  Oil", "30 ml", 16, 0, 0, 16, "Kerebe (Myrrh) Oil", "30ml", "MAP", "normalized", "high", "16 inactive links; spacing/name difference"),
  r("Frankincense Oil", "30 ml", 15, 0, 0, 15, "Frankincense Oil", "30ml", "MAP", "normalized", "high", "15 inactive links; space-only difference"),
  r("Kerbe Powder", "100 g", 15, 0, 0, 15, "Kerbe Powder", "100g", "MAP", "normalized", "high", "15 inactive links; space-only difference"),
  r("Turmeric Powder", "200 g", 15, 0, null, null, "", "", "REVIEW", "ambiguous", "low", "No active Turmeric; Erde may be a different product"),
  r("Kesil Powder", "200 g", 14, 0, 0, 14, "Kesil Powder", "200g", "MAP", "normalized", "high", "14 inactive links; space-only difference"),
  r("Cinnamon", "100 g", 13, 0, 0, 13, "Cinnamon", "100g", "MAP", "normalized", "high", "13 inactive links; space-only difference"),
  r("Ashwagandha Powder", "250 g", 12, 0, 0, 12, "Ashewagenda powder", "300g", "REVIEW", "size_substitution", "low", "12 inactive; 250g vs 300g; confirm"),
  r("Ashewagenda (Himalya) Tablet", "120 Tablet", 11, 5, 0, 6, "Ashewagenda (Himalya) Tablet", "120 Tablet", "REVIEW", "exact", "high", "120 Tablet variant exists but is inactive; confirm mapping"),
  r("Kerebe (Myrrh )  Oil", "60 ml", 10, 0, 0, 10, "Kerebe (Myrrh) Oil", "60ml", "MAP", "normalized", "high", "10 inactive links; spacing difference"),
  r("Asella Frankincense Raw", "100g", 8, 4, 4, 0, "Asella Frankincense Raw", "100g", "MAP", "exact", "high", "4 NULL + 4 active"),
  r("Blackseed Oil", "30ml", 8, 2, 0, 6, "Blackseed Oil", "30ml", "REVIEW", "exact", "high", "30ml variant exists but is inactive; confirm mapping or 250ml substitution"),
  r("Blackseed Oil", "30 ml", 7, 0, 0, 7, "Blackseed Oil", "30ml", "REVIEW", "normalized", "high", "30ml variant is inactive; confirm mapping or 250ml substitution"),
  r("Ashwagandha Tablet (Himalayan)", "120 capsules", 7, 0, 0, 7, "Ashewagenda (Himalya) Tablet", "120 Tablet", "REVIEW", "rename", "medium", "7 inactive; form/name change; confirm"),
  r("Kerbe Raw", "100 g", 7, 0, 0, 7, "Asella Kerbe Raw", "100g", "REVIEW", "rename", "medium", "7 inactive; Kerbe Raw vs Asella Kerbe Raw; confirm"),
  r("Himalayan Shilajit Jell", "1 jar (20g)", 5, 0, 0, 5, "", "", "LEAVE_NULL", "discontinued", "low", "No active jelly product; keep snapshot unlinked"),
  r("Coffee", "500g", 4, 4, null, null, "Coffee", "500g", "MAP", "exact", "high", "4 NULL; active Coffee 500g exists"),
  r("trumeric (Erde)", "200 g", 4, 0, 0, 4, "", "", "REVIEW", "ambiguous", "low", "Turmeric/Erde naming; no active match confirmed"),
  r("Shilajit Jel", "20g", 3, 0, 0, 3, "", "", "LEAVE_NULL", "discontinued", "low", "No active jelly product"),
  r("Hibscus Dry Leafe", "100 g", 3, 1, 0, 2, "Hibscus Dry Leafe", "100g", "MAP", "normalized", "high", "1 NULL + 2 inactive; space-only difference"),
  r("Shilajit Gummies", "30 Gummies", 3, 2, 0, 1, "Shilajit Gummies", "30 Gummies", "REVIEW", "exact", "high", "30 Gummies variant exists but is inactive; confirm mapping"),
  r("Erde", "200 g", 3, 0, 0, 3, "Erde", "200g", "MAP", "normalized", "high", "3 inactive links; space-only difference"),
  r("hibiscus  Kerkede Leafe", "200 g", 3, 0, 0, 3, "Hibscus Dry Leafe", "200g", "REVIEW", "rename", "medium", "Production uses Hibscus Dry Leafe; confirm Kerkede = Hibiscus"),
  r("Ashwagandha Powder", "100 g", 2, 0, 0, 2, "Ashewagenda powder", "300g", "REVIEW", "size_substitution", "low", "2 inactive; 100g vs 300g; confirm"),
  r("Clove", "100g", 2, 0, 0, 2, "Cloves", "100g", "MAP", "rename", "high", "2 inactive; singular/plural"),
  r("myrrh (Kerbe) Powder", "100 g", 2, 0, 0, 2, "Kerbe Powder", "100g", "MAP", "rename", "high", "2 inactive; synonym"),
  r("Moringa Seed", "200g", 2, 2, null, null, "Moringa Seed", "200g", "REVIEW", "exact", "high", "200g variant exists but is inactive; confirm mapping"),
  r("Moringa Seed", "500g", 2, 2, null, null, "Moringa Seed", "500g", "REVIEW", "exact", "high", "500g variant exists but is inactive; confirm mapping"),
  r("Kerkede Leafe", "200 g", 2, 0, 0, 2, "Hibscus Dry Leafe", "200g", "REVIEW", "rename", "medium", "Production uses Hibscus Dry Leafe; confirm Kerkede = Hibiscus"),
  r("Ashwegenda Powder", "300g", 2, 0, 0, 2, "Ashewagenda powder", "300g", "MAP", "rename", "high", "2 inactive; spelling"),
  r("Asella Kerbe Raw", "100 g", 2, 0, 0, 2, "Asella Kerbe Raw", "100g", "MAP", "normalized", "high", "2 inactive links; space-only difference"),
  r("Kerkede Leafe", "100 g", 2, 0, 0, 2, "Hibscus Dry Leafe", "100g", "REVIEW", "rename", "medium", "Production uses Hibscus Dry Leafe; confirm Kerkede = Hibiscus"),
  r("Frankincense Oil", "60ml", 2, 2, null, null, "Frankincense Oil", "60ml", "REVIEW", "exact", "high", "60ml variant exists but is inactive; confirm mapping"),
  r("Blackseed Oil", "250 ml", 2, 0, 2, 0, "Blackseed Oil", "250ml", "NO_ACTION", "exact", "high", "2 already active"),
  r("Shilajit Oil", "30ml", 2, 0, 0, 2, "", "", "LEAVE_NULL", "discontinued", "low", "No Shilajit Oil in production catalog; keep snapshot unlinked"),
  r("Ashewagenda (300g) powder", "300g", 1, 0, 0, 1, "Ashewagenda powder", "300g", "MAP", "rename", "high", "1 inactive; name variant"),
  r("Custom Item", "Standard", 1, 1, null, null, "", "", "LEAVE_NULL", "custom", "high", "Not a catalog product"),
  r("Moringa Seed", "200 g", 1, 0, 0, 1, "Moringa Seed", "200g", "REVIEW", "normalized", "high", "200g variant is inactive; confirm mapping"),
  r("Ashwagandha Powder", "220 g", 1, 0, 0, 1, "Ashewagenda powder", "300g", "REVIEW", "size_substitution", "low", "1 inactive; 220g vs 300g; confirm"),
  r("Asella Kerbe Raw", "Standard", 1, 1, null, null, "", "", "LEAVE_NULL", "custom", "high", "No size; keep unlinked"),
  r("hibiscus Kerkede Leafe", "100 g", 1, 0, 0, 1, "Hibscus Dry Leafe", "100g", "REVIEW", "rename", "medium", "Production uses Hibscus Dry Leafe; confirm Kerkede = Hibiscus"),
  r("myrrh Kerbe Raw", "100 g", 1, 0, 0, 1, "Asella Kerbe Raw", "100g", "REVIEW", "rename", "medium", "1 inactive; myrrh Kerbe Raw vs Asella Kerbe Raw; confirm"),
  r("Kerebe (Myrrh) Oil", "Standard", 1, 1, null, null, "", "", "LEAVE_NULL", "custom", "high", "No size; keep unlinked"),
  r("Myrrh  Kerebe   Oil", "60 ml", 1, 0, 0, 1, "Kerebe (Myrrh) Oil", "60ml", "MAP", "normalized", "high", "1 inactive; spacing difference"),
];

function r(name, size, items, nullPid, activePid, inactivePid, group, targetSize, decision, matchType, confidence, notes) {
  return { name, size, items, nullPid, activePid, inactivePid, group, targetSize, decision, matchType, confidence, notes };
}

function csv(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

const header = [
  "legacy_name", "legacy_size", "items", "null_pid", "active_pid", "inactive_pid",
  "proposed_group", "proposed_size", "decision", "match_type", "confidence", "notes",
];

const lines = [header.map(csv).join(",")];
for (const row of rows) {
  lines.push([
    row.name, row.size, row.items, row.nullPid, row.activePid, row.inactivePid,
    row.group, row.targetSize, row.decision, row.matchType, row.confidence, row.notes,
  ].map(csv).join(","));
}

const out = path.resolve(__dirname, "catalog-legacy-decisions.csv");
fs.writeFileSync(out, lines.join("\r\n") + "\r\n", "utf8");

const sum = (key) => rows.reduce((n, row) => n + (Number(row[key]) || 0), 0);
const totalItems = sum("items");
const totalNull = sum("nullPid");
const totalActive = sum("activePid");
const totalNotActive = totalItems - totalNull - totalActive;

console.log(`Wrote ${rows.length} rows to ${out}`);
console.log(`items=${totalItems} null_pid=${totalNull} active_pid=${totalActive} not_active=${totalNotActive}`);

if (totalItems !== 1981) {
  console.error(`Expected 1981 order items, got ${totalItems}`);
  process.exitCode = 1;
}
if (totalNull !== 398) {
  console.error(`Expected 398 NULL product_id rows, got ${totalNull}`);
  process.exitCode = 1;
}
if (totalActive !== 923) {
  console.error(`Expected 923 active-product links, got ${totalActive}`);
  process.exitCode = 1;
}
if (totalNotActive !== 660) {
  console.error(`Expected 660 not-active links, got ${totalNotActive}`);
  process.exitCode = 1;
}
