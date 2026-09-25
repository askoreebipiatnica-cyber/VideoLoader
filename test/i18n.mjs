import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LOCALES = path.join(DIR, "_locales");

let pass = 0, fail = 0;
function eq(name, got, want) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; console.log("PASS " + name); }
  else { fail++; console.log("FAIL " + name + "\n  got:  " + a + "\n  want: " + b); }
}

const langs = readdirSync(LOCALES, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
eq("i18n langs", langs, ["de", "en", "kk", "ko", "ru", "zh"]);

const dicts = {};
for (const l of langs) {
  try {
    dicts[l] = JSON.parse(readFileSync(path.join(LOCALES, l, "messages.json"), "utf8"));
  } catch {
    console.log("FAIL i18n parse " + l);
    fail++;
  }
}

const refKeys = Object.keys(dicts.en || {}).sort();
eq("i18n ref not empty", refKeys.length > 40, true);
for (const l of langs) {
  const keys = Object.keys(dicts[l] || {}).sort();
  eq(`i18n keys ${l}`, keys, refKeys);
  const empty = Object.entries(dicts[l]).filter(([, v]) => !v || typeof v.message !== "string" || !v.message.length);
  eq(`i18n no-empty ${l}`, empty.map(([k]) => k), []);
}

// Хромые плейсхолдеры: «…» и «» везде парные
for (const l of langs) {
  const bad = Object.entries(dicts[l])
    .filter(([, v]) => (v.message.match(/«/g) || []).length !== (v.message.match(/»/g) || []).length)
    .map(([k]) => k);
  eq(`i18n quotes ${l}`, bad, []);
}

// manifest ссылается на существующую default_locale
const mf = JSON.parse(readFileSync(path.join(DIR, "manifest.json"), "utf8"));
eq("i18n manifest default_locale", langs.includes(mf.default_locale), true);
eq("i18n manifest name", mf.name, "__MSG_appName__");
eq("i18n manifest desc", mf.description, "__MSG_appDesc__");

console.log(`\nI18N pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
