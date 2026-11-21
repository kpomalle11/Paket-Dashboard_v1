import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { escapeHtml } = require("../js/escape-html.js");

const indexHtml = readFileSync("index.html", "utf8");
const schedulerHtml = readFileSync("scheduler.html", "utf8");
const rules = JSON.parse(readFileSync("database.rules.json", "utf8"));
const hosting = JSON.parse(readFileSync("firebase.json", "utf8"));
const rc = JSON.parse(readFileSync(".firebaserc", "utf8"));
const gitignore = readFileSync(".gitignore", "utf8");
const config = readFileSync("js/paket-config.js", "utf8");

assert.equal(escapeHtml(`<img src=x onerror="alert(1)">`), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
assert.equal(escapeHtml("O'Brien & Co"), "O&#39;Brien &amp; Co");
assert.equal(escapeHtml(null), "");

for (const page of [indexHtml, schedulerHtml]) {
    assert.equal(page.includes("Paket2026!"), false);
    assert.equal(page.includes("Kevin2829!"), false);
    assert.equal(page.includes("__embeddedRawRows"), false);
    assert.equal(page.includes("type=\"password\""), false);
    assert.equal(page.includes("attemptLogin"), false);
    assert.equal(page.includes("js/paket-firebase.js"), true);
    assert.equal(page.includes("OAuthProvider"), false, "Microsoft provider lives in the shared module");
}

assert.equal(indexHtml.includes("let skuStats = {"), false);
assert.match(schedulerHtml, /let skuStats = \{\}/);
assert.match(schedulerHtml, /let recentRuns = \{\}/);
assert.match(schedulerHtml, /esc\(j\.customer\)/);
assert.match(schedulerHtml, /esc\(j\.notes\)/);
assert.match(schedulerHtml, /esc\(j\.item\)/);
assert.equal(schedulerHtml.includes("onclick=\"openModal('"), false);
assert.match(indexHtml, /esc\(name\)/);
assert.match(indexHtml, /esc\(sku\)/);
assert.match(config, /microsoftTenantId: "YOUR_PAKET_TENANT_ID"/);

assert.equal(rc.projects.default, "paket-production-dashboard-v1");
assert.equal(hosting.database.rules, "database.rules.json");
assert.equal(hosting.hosting.public, ".");
assert.ok(hosting.hosting.ignore.some((pattern) => pattern.includes("data")));

assert.equal(rules.rules.admins.$uid[".write"], false);
assert.match(rules.rules["paket-dashboard"][".read"], /auth != null/);
assert.match(rules.rules["paket-dashboard"][".write"], /admins/);
assert.match(rules.rules["paket-scheduler"][".write"], /admins/);
assert.equal(rules.rules.$other[".read"], false);
assert.equal(rules.rules.$other[".write"], false);

assert.match(gitignore, /historical-seed\.json/);
assert.match(gitignore, /data\/\*\.js/);
assert.equal(existsSync("data/paket_data.js"), false);

const tracked = spawnSync("git", ["ls-files", "data"], { encoding: "utf8" });
assert.equal(tracked.stdout.trim(), "", "data files must not stay tracked");

console.log("static checks passed");
