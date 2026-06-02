import assert from "node:assert/strict";
import { sampleProducts } from "../src/data/sampleProducts";
import { generateStylistResult } from "../src/lib/stylistEngine";

const polishedUnder50 = generateStylistResult(
  sampleProducts,
  "Build a polished work outfit under $50",
);
assert.equal(polishedUnder50.intent.budget, 50);
assert.equal(polishedUnder50.intent.budgetScope, "total");
assert.equal(polishedUnder50.intent.size, undefined);
assert.equal(polishedUnder50.total, 0);
assert.equal(polishedUnder50.outfit.length, 0);
assert.match(polishedUnder50.title, /No Exact/);

const polishedUnder300 = generateStylistResult(
  sampleProducts,
  "Build a polished work outfit under $300",
);
assert.equal(polishedUnder300.intent.budgetScope, "total");
assert.ok(polishedUnder300.outfit.length > 0);
assert.ok(polishedUnder300.total <= 300);

const scarfUnder60 = generateStylistResult(sampleProducts, "Find a scarf under $60");
assert.equal(scarfUnder60.intent.budgetScope, "item");
assert.equal(scarfUnder60.outfit.length, 1);
assert.equal(scarfUnder60.outfit[0].name, "Graphic Silk Scarf");
assert.ok(scarfUnder60.outfit.every((product) => product.price <= 60));

const eachItemUnder90 = generateStylistResult(
  sampleProducts,
  "Build a polished work outfit with every item under $90",
);
assert.equal(eachItemUnder90.intent.budgetScope, "item");
assert.equal(eachItemUnder90.outfit.length, 0);
assert.match(eachItemUnder90.title, /No Exact/);

const explicitSize = generateStylistResult(
  sampleProducts,
  "Build a polished work outfit size M under $300",
);
assert.equal(explicitSize.intent.size, "M");
assert.equal(explicitSize.intent.budget, 300);

console.log("Stylist engine verification passed.");
