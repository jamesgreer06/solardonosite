/**
 * Source: scripts/shop_flat.tsv (tab-separated, no header)
 * Columns: item, shopPath, pressureScore, pressureWord, volume,
 *   buyWas, buyNew, buyDeltaPct, sellWas, sellNew, sellDeltaPct
 * Empty cell = no value for that side.
 * Run: node scripts/emit-shop-from-tsv.mjs > data/shop-price-changes.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tsvPath = path.join(__dirname, "shop_flat.tsv");
const text = fs.readFileSync(tsvPath, "utf8");

function n(s) {
  const t = String(s || "").trim();
  if (t === "") return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

function displayName(item) {
  return String(item)
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"));
const now = new Date();
const generatedAt = now.toISOString();
const priceChangedAt = new Date(now.getTime() - 15 * 60 * 1000).toISOString();

const rows = lines.map((line) => {
  const p = line.split("\t");
  if (p.length < 11) {
    throw new Error("Expected 11 columns: " + line.slice(0, 100));
  }
  const pressureWord = String(p[3]).trim();
  const pressureType =
    pressureWord === "Demand" ? "demand" : pressureWord === "Supply" ? "supply" : "mixed";
  return {
    item: p[0].trim(),
    displayName: displayName(p[0].trim()),
    priceChangedAt,
    pressureType,
    pressureScore: n(p[2]),
    volume: n(p[4]),
    buyWas: n(p[5]),
    buyNew: n(p[6]),
    buyDeltaPct: n(p[7]),
    sellWas: n(p[8]),
    sellNew: n(p[9]),
    sellDeltaPct: n(p[10]),
  };
});

const out = {
  generatedAt,
  rows,
};

const outPath = path.join(__dirname, "..", "data", "shop-price-changes.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
process.stdout.write("Wrote " + outPath + " (" + rows.length + " rows)\n");
