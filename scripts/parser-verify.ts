/**
 * Suite de verificación del parser de banderas/idiomas de Harbor (parche Hermes).
 *
 * Ejecutar desde la raíz del repo:
 *   node --experimental-strip-types scripts/parser-verify.ts
 * (Node >= 22.18 hace el type-stripping por defecto; el flag es inocuo.)
 *
 * Cubre: banderas MX/AR/CO/PE/CL → "Spanish (Latin America)", token SPANISH →
 * "Spanish", CASTELLANO → "Spanish", bloque ❓ → "Spanish (Unknown)" (que la UI
 * pinta como bandera de España + tile '?'), Multi, probe 🎙️, y negativos.
 */
import { parseLanguages } from "../src/lib/streams/parser/parser-language.ts";

type Case = [name: string, text: string, check: (r: string[]) => boolean];

const eq = (r: string[], expected: string[]) =>
  JSON.stringify(r) === JSON.stringify(expected);

const cases: Case[] = [
  ["flag 🇲🇽 → LatAm",          "Cars.dual-lat 🇲🇽 🇺🇸🦅",   (r) => r.includes("Spanish (Latin America)")],
  ["flag 🇦🇷 → LatAm",          "Cars AR 🇦🇷",               (r) => r.includes("Spanish (Latin America)")],
  ["flag 🇨🇴 → LatAm",          "Cars CO 🇨🇴",               (r) => r.includes("Spanish (Latin America)")],
  ["flag 🇵🇪 → LatAm",          "Cars PE 🇵🇪",               (r) => r.includes("Spanish (Latin America)")],
  ["flag 🇨🇱 → LatAm",          "Cars CL 🇨🇱",               (r) => r.includes("Spanish (Latin America)")],
  ["flag 🇪🇸 solo → Spanish",    "Cars.2006.REMUX-FGT 🇪🇸",   (r) => eq(r, ["Spanish"])],
  ["token SPANISH → Spanish",   "Cars.2.2011.SPANISH.BluRay", (r) => eq(r, ["Spanish"])],
  ["token CASTELLANO → Spanish","Cars.Castellano.1080p",      (r) => eq(r, ["Spanish"])],
  ["token LATINO → LatAm",      "Cars.LATINO.mkv",            (r) => eq(r, ["Spanish (Latin America)"])],
  ["❓ bloque puro → Unknown",   "🇪🇸❓🇲🇽",                    (r) => eq(r, ["Spanish (Unknown)"])],
  ["❓ con EN → Unknown + Multi","FGT 🇪🇸❓🇲🇽 🇺🇸🦅",          (r) => r.includes("Spanish (Unknown)") && r.includes("English") && r[0] === "Multi"],
  ["❓ borra Spanish genérico",  "FGT ❓ 🇪🇸 🇺🇸🦅",            (r) => r.includes("Spanish (Unknown)") && !r.includes("Spanish")],
  ["MULTI + ES + EN",           "Cars MULTI 🇪🇸 🇺🇸",          (r) => r[0] === "Multi" && r.includes("Spanish") && r.includes("English")],
  ["probe 🎙️ EN+ES",            "🎙️ 🇬🇧 🎙️ 🇪🇸 🇺🇸🦅",          (r) => r.includes("English") && r.includes("Spanish")],
  ["ENG token → English",       "Cars.ENG.1080p",             (r) => eq(r, ["English"])],
  ["🇪🇸 + 🇲🇽 + 🇺🇸 → Multi trío", "Cars 🇪🇸 🇲🇽 🇺🇸",            (r) => r[0] === "Multi" && r.includes("Spanish") && r.includes("Spanish (Latin America)") && r.includes("English")],
  ["sin datos → vacío",         "Cars.2006.2160p.mkv",        (r) => eq(r, [])],
  ["🇲🇽 solo → LatAm exacto",    "Cars-dual-lat 🇲🇽",           (r) => eq(r, ["Spanish (Latin America)"])],
  ["[Spanish] + 🇲🇽 → solo latino", "Cuando harry enf… [Spanish] ⛿ ᴇs-ᴍx » 🇲🇽", (r) => eq(r, ["Spanish (Latin America)"])],
  ["⛉ Jackett ES no aporta idioma", "⛉ [RD] Jackett ES\n⛿ ʀᴜ » 🇷🇺", (r) => eq(r, ["Russian"])],
  ["CASTELLANO + 🇲🇽 conserva ambos", "Cars [Castellano] 🇲🇽 1080p", (r) => r.includes("Spanish") && r.includes("Spanish (Latin America)")],
];

let pass = 0;
let fail = 0;
for (const [name, text, check] of cases) {
  const got = parseLanguages(text);
  const ok = (() => { try { return check(got); } catch { return false; } })();
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(30)} ${JSON.stringify(got)}`);
}
console.log(`\n${pass}/${pass + fail} OK`);
process.exit(fail ? 1 : 0);
