import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const SOURCES = [
  "src/core/geometry.js",
  "src/core/layout.js",
  "src/core/rules.js",
  "src/core/protocol.js",
  "src/adapters/dom-adapter.js",
  "src/renderers/text-renderer.js",
  "src/renderers/svg-renderer.js",
  "src/index.js",
];

const header = `/*!
 * NkapSDK v1.2.0 — Multi-Channel Financial Linguistic & Visual Overlay SDK
 * Built from nkap-sdk/src/* (zero dependencies)
 */\n`;

const bundle =
  header +
  SOURCES.map((rel) => {
    const abs = path.join(__dirname, rel);
    return `/* === ${rel} === */\n` + fs.readFileSync(abs, "utf8").trim() + "\n";
  }).join("\n");

const targets = [
  path.join(__dirname, "dist", "nkap-sdk.js"),
  path.join(repoRoot, "nkap-extension", "vendor", "nkap-sdk.js"),
  path.join(repoRoot, "cerveau", "static", "sdk", "nkap-sdk.js"),
];

for (const out of targets) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, bundle, "utf8");
  console.log(`[nkap-sdk/build] OK -> ${path.relative(repoRoot, out)} (${(bundle.length / 1024).toFixed(1)} KB)`);
}
