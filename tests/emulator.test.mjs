/**
 * Runs against the Firebase emulators started by `npm test`
 * (auth :9099, database :9000, hosting :5000).
 *
 * Proves:
 *   - signed-out reads and writes are denied
 *   - a Microsoft user can read dashboard and scheduler data
 *   - a non-admin Microsoft user cannot write
 *   - an admin (boolean true under /admins/{uid}) can write
 *   - nobody can write the admin list from the client
 *   - other database paths are denied
 *   - an email/password user cannot read
 *   - both pages open after emulator sign-in
 *   - customer and operator text cannot inject HTML
 *   - historical seed import and the shift-report upload path still save
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { initializeApp, deleteApp } from "firebase/app";
import {
    getAuth,
    connectAuthEmulator,
    signInWithCredential,
    createUserWithEmailAndPassword,
    OAuthProvider,
} from "firebase/auth";
import { getDatabase, connectDatabaseEmulator, ref, get, set } from "firebase/database";
import admin from "firebase-admin";
import puppeteer from "puppeteer-core";

const PROJECT = "paket-production-dashboard-v1";
const TENANT = "00000000-0000-0000-0000-000000000001";
const firebaseConfig = {
    apiKey: "demo-api-key",
    authDomain: "localhost",
    databaseURL: "https://paket-production-dashboard-v1-default-rtdb.firebaseio.com",
    projectId: PROJECT,
};

function base64Url(obj) {
    return Buffer.from(JSON.stringify(obj))
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

function microsoftIdToken({ sub, email, tid }) {
    return [
        base64Url({ alg: "none", typ: "JWT" }),
        base64Url({
            sub,
            email,
            email_verified: true,
            name: email,
            tid,
            oid: sub,
            iss: `https://login.microsoftonline.com/${tid}/v2.0`,
            aud: "emulator",
        }),
        "",
    ].join(".");
}

function assertDenied(promise) {
    return promise.then(
        () => {
            throw new Error("expected permission denied");
        },
        (err) => {
            const text = `${err.code || ""} ${err.message || err}`;
            if (!/permission|PERMISSION_DENIED|unauthorized/i.test(text)) throw err;
        }
    );
}

async function microsoftUser(name, { sub, email, tid = TENANT }) {
    const app = initializeApp(firebaseConfig, name);
    const auth = getAuth(app);
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    const provider = new OAuthProvider("microsoft.com");
    const credential = provider.credential({
        idToken: microsoftIdToken({ sub, email, tid }),
        accessToken: "emulator-access-token",
    });
    const result = await signInWithCredential(auth, credential);
    const token = await result.user.getIdTokenResult();
    const db = getDatabase(app);
    connectDatabaseEmulator(db, "127.0.0.1", 9000);
    return { app, auth, db, user: result.user, provider: token.claims.firebase.sign_in_provider };
}

async function rulesTests() {
    process.env.FIREBASE_DATABASE_EMULATOR_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9000";
    process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
    if (!admin.apps.length) {
        admin.initializeApp({ projectId: PROJECT, databaseURL: firebaseConfig.databaseURL });
    }
    await admin.database().ref("/").set(null);

    const anon = initializeApp(firebaseConfig, "anon");
    const anonDb = getDatabase(anon);
    connectDatabaseEmulator(anonDb, "127.0.0.1", 9000);
    await assertDenied(get(ref(anonDb, "paket-dashboard/latest")));
    await assertDenied(set(ref(anonDb, "paket-dashboard/latest"), { x: 1 }));
    await assertDenied(set(ref(anonDb, "paket-scheduler/latest"), { x: 1 }));
    await assertDenied(get(ref(anonDb, "secrets")));
    await deleteApp(anon);

    const emailApp = initializeApp(firebaseConfig, "email-user");
    const emailAuth = getAuth(emailApp);
    connectAuthEmulator(emailAuth, "http://127.0.0.1:9099", { disableWarnings: true });
    await createUserWithEmailAndPassword(emailAuth, "plain@paket.test", "not-used-in-prod");
    const emailDb = getDatabase(emailApp);
    connectDatabaseEmulator(emailDb, "127.0.0.1", 9000);
    await assertDenied(get(ref(emailDb, "paket-dashboard/latest")));
    await deleteApp(emailApp);

    const viewer = await microsoftUser("viewer", { sub: "viewer-1", email: "viewer@paket.test" });
    assert.equal(viewer.provider, "microsoft.com");
    await assertDenied(get(ref(viewer.db, "no-such-path")));
    await assertDenied(set(ref(viewer.db, "paket-dashboard/latest"), { blocked: true }));
    await assertDenied(set(ref(viewer.db, "paket-scheduler/latest"), { blocked: true }));
    await assertDenied(set(ref(viewer.db, `admins/${viewer.user.uid}`), true));
    const empty = await get(ref(viewer.db, "paket-dashboard/latest"));
    assert.equal(empty.exists(), false);

    const adminUser = await microsoftUser("admin-user", { sub: "admin-1", email: "kevin@paket.test" });
    assert.equal(adminUser.provider, "microsoft.com");
    await admin.database().ref(`admins/${adminUser.user.uid}`).set(true);
    await set(ref(adminUser.db, "paket-dashboard/latest"), { dashboardData: { meta: { totalRuns: 1 } } });
    await set(ref(adminUser.db, "paket-scheduler/latest"), { jobs: [], savedAt: "2026-01-01T00:00:00.000Z" });
    const saved = await get(ref(viewer.db, "paket-dashboard/latest/dashboardData/meta/totalRuns"));
    assert.equal(saved.val(), 1);
    await assertDenied(set(ref(adminUser.db, `admins/${adminUser.user.uid}`), false));
    await assertDenied(set(ref(adminUser.db, "somewhere-else"), { x: 1 }));

    await deleteApp(viewer.app);
    await deleteApp(adminUser.app);
    await admin.database().ref("/").set(null);
    console.log("rules checks passed");
}

async function waitForPaket(page) {
    await page.waitForFunction(() => window.Paket && Paket.db && Paket.db(), { timeout: 30000 });
}

async function signIn(page) {
    await waitForPaket(page);
    const already = await page.$eval("#login-screen", (el) => el.style.display === "none");
    if (!already) {
        await page.click("#login-btn");
    }
    await page.waitForFunction(() => {
        const login = document.getElementById("login-screen");
        return login && login.style.display === "none";
    }, { timeout: 30000 });
}

async function pageTests() {
    const extracted = spawnSync("python3", ["scripts/extract-historical-seed.py"], { encoding: "utf8" });
    if (extracted.status !== 0) {
        console.error(extracted.stdout, extracted.stderr);
        throw new Error("historical seed extraction failed");
    }
    assert.match(extracted.stdout, /raw rows/);
    const ignored = spawnSync("git", ["check-ignore", "-q", "data/historical-seed.json"]);
    assert.equal(ignored.status, 0, "historical seed must be gitignored");
    const seed = JSON.parse(readFileSync("data/historical-seed.json", "utf8"));
    assert.ok(Array.isArray(seed.rawRows) && seed.rawRows.length > 100);
    assert.ok(seed.dashboardData && seed.dashboardData.meta && seed.dashboardData.meta.totalRuns > 100);

    const browser = await puppeteer.launch({
        executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
        headless: true,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));
    page.on("console", (msg) => {
        if (msg.type() === "error") pageErrors.push(msg.text());
    });

    await page.goto("http://127.0.0.1:5000/index.html?emulators=1", { waitUntil: "networkidle0", timeout: 60000 });
    await waitForPaket(page);
    const hint = await page.$eval("#login-hint", (el) => el.textContent);
    assert.match(hint, /emulator/i);

    await page.evaluate(() => {
        window.__xss = 0;
        ops = [["<img src=x onerror=\"window.__xss=1\">", { runs: 9, avg_eff: 90 }]];
        allData.weeklySkus = { "<svg/onload=window.__xss=1>": { runs: 2, total_units: 10, avg_eff: 80 } };
        allData.skus = {
            "<svg/onload=window.__xss=1>": {
                runs: 6, avg_eff: 90, min_eff: 1, max_eff: 99, total_output: 10, avg_output: 5,
                max_output: 8, avg_output_last5: 5, median_output_last5: 5, avg_staffing: 2,
                total_lost_mins: 12, avg_speed: 10, top_speed: 12,
            },
        };
        allData.lines = {
            "<img src=x>": { runs: 6, avg_eff: 70, total_output: 10, total_lost_mins: 4, speed_min: 1, speed_max: 2, speed_avg: 1 },
        };
        buildTables();
        buildRankings();
        const skuSel = document.getElementById("selSKU");
        skuSel.value = "<svg/onload=window.__xss=1>";
        showSKU();
        showLine();
        const lineSel = document.getElementById("selLine");
        lineSel.value = "<img src=x>";
        showLine();
        window.__rawCleanRows = [{
            date: new Date("2026-02-01"),
            item: "SAFE-01",
            line: "<img src=x>",
            eff: 0.5,
            output: 1,
            lost: 10,
            manning: 2,
            speed: 10,
            operator: "<img src=x onerror=window.__xss=1>",
            shift: 1,
            spvr: "",
            downtime: "<script>window.__xss=1</script>",
        }];
        buildDynamicInsights();
    });
    const dashHtml = await page.content();
    assert.equal(dashHtml.includes("<svg/onload"), false);
    assert.equal(dashHtml.includes("<img src=x"), false);
    assert.equal(dashHtml.includes("<script>window.__xss"), false);
    assert.equal(await page.evaluate(() => window.__xss), 0);

    await page.evaluate(() => Paket._emulatorSignIn({
        sub: "wrong-tenant",
        email: "outsider@example.com",
        tid: "ffffffff-ffff-ffff-ffff-ffffffffffff",
    }));
    await page.waitForFunction(() => {
        const err = document.getElementById("login-error");
        return err && /tenant/i.test(err.textContent);
    }, { timeout: 15000 });
    assert.equal(await page.$eval("#dashboard-main", (el) => el.style.display), "none");

    await signIn(page);
    const uid = await page.$eval("#userUid", (el) => el.textContent);
    assert.ok(uid.length > 5);
    assert.equal(await page.$eval("#adminPanel", (el) => el.style.display), "none");

    await admin.database().ref(`admins/${uid}`).set(true);
    await page.reload({ waitUntil: "networkidle0" });
    await signIn(page);
    await page.waitForFunction(() => document.getElementById("adminPanel").style.display === "block");

    const seedPath = new URL("../data/historical-seed.json", import.meta.url).pathname;
    const seedInput = await page.$("#seedInput");
    await seedInput.uploadFile(seedPath);
    await seedInput.evaluate((el) => el.dispatchEvent(new Event("change", { bubbles: true })));
    await page.waitForFunction(() => {
        const el = document.getElementById("uploadProgress");
        return el && (el.classList.contains("success") || el.classList.contains("error"));
    }, { timeout: 60000 });
    const seedStatus = await page.$eval("#uploadProgress", (el) => el.textContent);
    assert.match(seedStatus, /Historical data imported/);
    const subtitle = await page.$eval(".subtitle", (el) => el.textContent);
    assert.match(subtitle, /[\d,]+ Runs/);

    const xlsxCandidates = [
        process.env.SHIFT_REPORT,
        "/home/ubuntu/.cursor/projects/workspace/uploads/shift_report_latest_a51c.xlsx",
    ].filter(Boolean);
    const xlsx = xlsxCandidates.find((p) => existsSync(p));
    if (xlsx) {
        const fileInput = await page.$("#fileInput");
        await fileInput.uploadFile(xlsx);
        await fileInput.evaluate((el) => el.dispatchEvent(new Event("change", { bubbles: true })));
        await page.waitForFunction(() => {
            const el = document.getElementById("uploadProgress");
            return el && /Dashboard updated and saved|Error|rejected|Could not/i.test(el.textContent);
        }, { timeout: 90000 });
        const uploadStatus = await page.$eval("#uploadProgress", (el) => el.textContent);
        assert.match(uploadStatus, /Dashboard updated and saved/);
        assert.match(await page.$eval(".subtitle", (el) => el.textContent), /Runs/);
        console.log("shift-report upload path passed");
    } else {
        console.log("shift report xlsx not on this machine; upload path skipped");
    }

    await page.goto("http://127.0.0.1:5000/scheduler.html?emulators=1", { waitUntil: "networkidle0", timeout: 60000 });
    await signIn(page);
    await page.waitForFunction(() => document.getElementById("app").style.display === "block");
    assert.equal(await page.$eval("#saveScheduleBtn", (el) => el.disabled), false);
    await page.evaluate(() => {
        window.__xss = 0;
        buildWorkDays();
        jobs = [{
            id: "\"><img src=x onerror=window.__xss=1>",
            item: "<img src=x onerror=window.__xss=1>",
            customer: "<script>alert(1)</script>",
            desc: "<b>bad</b>",
            notes: "<img src=x onerror=window.__xss=2>",
            status: "READY TO RUN",
            po: "PO-1",
            qtyLeft: 10,
            due: "2099-01-01",
            special: null,
            compound: false,
            line: null,
            startDay: null,
            shifts: 1,
            locked: false,
            machine: "ELGIN",
            type: "",
            size: "",
        }];
        renderAll();
        openModal(jobs[0].id);
    });
    const schedHtml = await page.content();
    assert.equal(schedHtml.includes("<script>alert"), false);
    assert.equal(schedHtml.includes("<img src=x"), false);
    assert.equal(schedHtml.includes("<b>bad</b>"), false);
    assert.equal(await page.evaluate(() => window.__xss), 0);
    await page.evaluate(() => closeModal());
    await page.click("#saveScheduleBtn");
    await page.waitForFunction(() => /Schedule saved/.test(document.getElementById("uploadStatus").textContent), { timeout: 15000 });

    await page.evaluate(() => Paket._emulatorSignIn({ sub: "viewer-ui", email: "viewer.ui@paket.test" }));
    await page.waitForFunction(() => document.getElementById("saveScheduleBtn").disabled, { timeout: 15000 });
    const blocked = await page.evaluate(async () => {
        const before = document.getElementById("uploadStatus").textContent;
        try {
            await Paket.db().ref("paket-scheduler/latest").set({ jobs: [{ customer: "nope" }] });
            return "wrote";
        } catch (err) {
            return err.code || err.message;
        } finally {
            document.getElementById("uploadStatus").textContent = before;
        }
    });
    assert.match(blocked, /PERMISSION_DENIED|permission/i);

    const serious = pageErrors.filter((msg) => !/Firebase|favicon|404 \(Not Found\)/i.test(msg));
    if (serious.length) throw new Error("page errors:\n" + serious.join("\n"));
    await browser.close();
    console.log("page checks passed");
}

await rulesTests();
await pageTests();
console.log("emulator checks passed");
await admin.app().delete().catch(() => {});
process.exit(0);
