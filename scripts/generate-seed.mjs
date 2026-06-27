// Generates supabase/seed.sql from src/data/products.js
// Run with: node scripts/generate-seed.mjs
import { products } from "../src/data/products.js";
import { writeFileSync } from "fs";

function esc(str) {
  return String(str).replace(/'/g, "''");
}

const lines = products.map((p) => {
  return `insert into public.products (id, name, sku, category, price, mrp, stock, image_url, warehouse_delhi, warehouse_ludhiana, warehouse_jaipur) values (${p.id}, '${esc(p.name)}', '${esc(p.sku)}', '${esc(p.cat)}', ${p.price}, ${p.mrp}, ${p.stock}, '${esc(p.img)}', ${p.wh.delhi}, ${p.wh.ludhiana}, ${p.wh.jaipur}) on conflict (id) do update set name = excluded.name, sku = excluded.sku, category = excluded.category, price = excluded.price, mrp = excluded.mrp, stock = excluded.stock, image_url = excluded.image_url, warehouse_delhi = excluded.warehouse_delhi, warehouse_ludhiana = excluded.warehouse_ludhiana, warehouse_jaipur = excluded.warehouse_jaipur;`;
});

const sql =
  "-- Auto-generated from src/data/products.js — do not edit by hand.\n" +
  "-- Regenerate with: node scripts/generate-seed.mjs\n" +
  "-- NOTE: image_url stores the local /images/... path served by this app's public/ folder.\n" +
  "-- If you move product images to Supabase Storage instead, update these to full storage URLs.\n\n" +
  lines.join("\n") +
  "\n";

writeFileSync(new URL("../supabase/seed.sql", import.meta.url), sql, "utf8");
console.log(`Wrote ${products.length} product rows to supabase/seed.sql`);
