/* Class code on Start tracking, and the Library, in a real browser. Start servers.mjs with:
     CLASS_CODE="Pink Nurses 26" LIBRARY_ADMIN_KEY="test-library-admin-key-0123456789abcdef" PG_MODULES=... node tests/sync/servers.mjs
   then:  node tests/sync/e2e-library.js [screenshot folder]
   Checks: the class code is asked before a new tracking code (and enforced by the server),
   linking doesn't need it; uploads of every allowed type, rejection of other types and big files,
   the two sharing boxes, filters, downloads, deleting your own file, and the hidden admin page. */
const {chromium} = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const {Client} = require("pg");
const fs = require("fs");
const os = require("os");
const path = require("path");
const BASE = "http://localhost:8790/";
const OUT = process.argv[2] || os.tmpdir();
const ADMIN_KEY = "test-library-admin-key-0123456789abcdef";
const R2 = () => JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "pinkprint-r2.json"), "utf8"));
let failures = 0;
const check = (ok, label, extra) => { console.log((ok ? "ok   " : "FAIL ") + label + (extra !== undefined ? "  [" + extra + "]" : "")); if (!ok) failures++; };

/* Small files whose first bytes are what real ones start with (the server reads contents, not names) */
const pad = n => Buffer.alloc(n, 0x20);
const u16 = s => Buffer.from([...s].flatMap(c => [c.charCodeAt(0), 0]));
const FILES = {
  pdf: {name: "wound-care.pdf", mimeType: "application/pdf", buffer: Buffer.concat([Buffer.from("%PDF-1.4\n%test\n"), pad(3000)])},
  jpg: {name: "diagram.jpg", mimeType: "image/jpeg", buffer: Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.from("JFIF"), pad(2000)])},
  png: {name: "chart.png", mimeType: "image/png", buffer: Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), pad(2000)])},
  webp: {name: "photo.webp", mimeType: "image/webp", buffer: Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 8, 0, 0]), Buffer.from("WEBPVP8 "), pad(2000)])},
  heic: {name: "IMG_0042.HEIC", mimeType: "image/heic", buffer: Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic"), pad(2000)])},
  doc: {name: "old notes.doc", mimeType: "application/msword", buffer: Buffer.concat([Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]), pad(600), u16("WordDocument"), pad(600)])},
  docx: {name: "Study guide.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
         buffer: Buffer.concat([Buffer.from([0x50, 0x4B, 0x03, 0x04]), pad(30), Buffer.from("word/document.xml"), pad(800)])}
};
/* Real files for Preview: a 1x1 PNG and a small Word file with two paragraphs */
const REAL = {
  png: {name: "dot.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64")},
  docx: {name: "stages.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
         buffer: Buffer.from("UEsDBBQAAAAIAL26Ul15bjPX6AAAAK0BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QyU7DMBD9FWuuKHHggBCK0wPLETiUDxjZk8SqN3nc0v49Tlt6QIXjzFv1+tXeO7GjzDYGBbdtB4KCjsaGScHn+rV5AMEFg0EXAyk4EMNq6NeHRCyqNrCCuZT0KCXrmTxyGxOFiowxeyz1zJNMqDc4kbzrunupYygUSlMWDxj6Zxpx64p42df3qUcmxyCeTsQlSwGm5KzGUnG5C+ZXSnNOaKvyyOHZJr6pBJBXExbk74Cz7r0Ok60h8YG5vKGvLPkVs5Em6q2vyvZ/mys94zhaTRf94pZy1MRcF/euvSAebfjpL49zD99QSwMEFAAAAAgAvbpSXZv9N+qtAAAAKQEAAAsAAABfcmVscy8ucmVsc43POw7CMAwG4KtE3mlaBoRQ0y4IqSsqB7ASN61oHkrCo7cnAwNFDIy2f3+W6/ZpZnanECdnBVRFCYysdGqyWsClP232wGJCq3B2lgQsFKFt6jPNmPJKHCcfWTZsFDCm5A+cRzmSwVg4TzZPBhcMplwGzT3KK2ri27Lc8fBpwNpknRIQOlUB6xdP/9huGCZJRydvhmz6ceIrkWUMmpKAhwuKq3e7yCzwpuarF5sXUEsDBBQAAAAIAL26Ul3kZcKGyQAAACwBAAARAAAAd29yZC9kb2N1bWVudC54bWxtj8FOxDAMRH8lyhma7h4QqtrujTPSwgekiWnLJnZkp5T+PQkSQkJcxrJm5snuL58xqA9gWQkHfWparQAd+RXnQb++PN0/aiXZoreBEAZ9gOjL2O+dJ7dFwKwKAKXbB73knDpjxC0QrTSUAIv3RhxtLivPZif2icmBSOHHYM5t+2CiXVFX5ET+qDNV4Sp5fOYS3hjUiu8bH/WWGaQ31avK35r+1q41pk5dqWXrspLbincKCadg0S12CqAYPBZ48w/M/Bxjfh8dvwBQSwECFAMUAAAACAC9ulJdeW4z1+gAAACtAQAAEwAAAAAAAAAAAAAAgAEAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUAxQAAAAIAL26Ul2b/TfqrQAAACkBAAALAAAAAAAAAAAAAACAARkBAABfcmVscy8ucmVsc1BLAQIUAxQAAAAIAL26Ul3kZcKGyQAAACwBAAARAAAAAAAAAAAAAACAAe8BAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAwADALkAAADnAgAAAAA=", "base64")},
  pdf: {name: "handout.pdf", mimeType: "application/pdf", buffer: Buffer.concat([Buffer.from("%PDF-1.4\n%test\n"), pad(500)])}
};
const BAD = {
  fakePdf: {name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("This is just text pretending to be a PDF. ".repeat(20))},
  exe: {name: "picture.png", mimeType: "image/png", buffer: Buffer.concat([Buffer.from("MZ"), pad(2000)])},
  xlsx: {name: "grades.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
         buffer: Buffer.concat([Buffer.from([0x50, 0x4B, 0x03, 0x04]), pad(30), Buffer.from("xl/workbook.xml"), pad(800)])}
};

(async () => {
  const db = new Client({host: "127.0.0.1", port: 54329, user: "postgres", database: "pp"});
  await db.connect();
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  await q("delete from public.shared_files; delete from public.challenges; delete from public.class_tally; delete from public.vault; delete from public.nickname_claims where ticket_hash is not null");
  await q("select public.set_library_admin_key($1)", [ADMIN_KEY]);
  const r0 = R2().length;   /* the stand-in bucket outlives a run; count from here */
  const b = await chromium.launch();
  const errors = [];
  const device = async name => {
    const c = await b.newContext({viewport: {width: 1200, height: 1000}, acceptDownloads: true});
    await c.route(/jsdelivr|googleapis|gstatic/, r => r.abort());
    c.on("page", pg => {
      pg.on("pageerror", e => errors.push(name + ": " + e.message));
      pg.on("dialog", d => d.accept());
    });
    return c;
  };
  const waitFor = async (fn, ms = 15000) => { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 200)); } return v; };
  const state = pg => pg.evaluate(() => JSON.parse(localStorage.getItem("pinkprint-tracking") || "null"));
  const text = (pg, sel) => pg.textContent(sel).then(t => t.replace(/\s+/g, " ").trim()).catch(() => "");

  // ---- A) Class code before a new tracking code ----
  const A = await device("A");
  const pa = await A.newPage();
  await pa.goto(BASE + "start-tracking.html?from=home");
  await pa.waitForSelector("#st-qr svg");
  check(await pa.isVisible("#st-start") && await pa.isVisible("#st-nick") && !(await pa.isVisible("#st-classcard")), "Start tracking: the steps show first as a preview, no class code yet");
  check(await pa.isVisible("#st-link"), "Already have a code? (linking) is still there without the class code");
  await pa.click("#st-start");
  await pa.waitForSelector("#st-classcard", {state: "visible"});
  check(await pa.$eval("#st-classdlg", d => d.open) && (await state(pa)) === null, "pressing Start tracking pops up the class code; nothing saved yet");
  await pa.screenshot({path: OUT + "/lib-classcode.png"});
  await pa.click("#st-classclose");
  check(!(await pa.isVisible("#st-classcard")) && (await state(pa)) === null, "Close shuts the pop-up without starting");
  await pa.click("#st-start");
  await pa.waitForSelector("#st-classcard", {state: "visible"});
  await pa.fill("#st-class", "wrong");
  await pa.click("#st-classgo");
  await pa.waitForSelector("#st-classmsg:not(.hidden)");
  check(/isn't right/.test(await text(pa, "#st-classmsg")) && (await state(pa)) === null, "wrong class code: told so, nothing started");
  // The server refuses a brand-new code without the class code, even when called directly
  const direct = await pa.evaluate(async () => {
    const r = await fetch("api/vault/save", {method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({lookup: Tracking.randomHex(32), data: "x", version: 0})});
    return r.status + " " + (await r.json()).error;
  });
  check(/^400 class code needed/.test(direct), "server: making a new code without the class code is refused", direct);
  const directWrong = await pa.evaluate(async () => {
    const r = await fetch("api/vault/save", {method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({lookup: Tracking.randomHex(32), data: "x", version: 0, classCode: "nope"})});
    return r.status;
  });
  check(directWrong === 400 && (await q("select count(*)::int n from public.vault"))[0].n === 0, "server: and with a wrong class code; nothing saved");
  await pa.fill("#st-class", "  pink NURSES 26 ");
  await pa.click("#st-classgo");
  await pa.waitForURL(BASE);
  check(true, "right class code (any case/spaces): tracking starts straight away");
  await waitFor(async () => { const s = await state(pa); return s && s.sync && s.sync.version > 0; });
  const sa = await state(pa);
  check(sa.sync.version > 0 && !("classCode" in sa) && (await q("select count(*)::int n from public.vault"))[0].n === 1, "tracking code made and saved; the class code isn't kept on the device afterwards");
  const vaultText = (await q("select data from public.vault"))[0].data;
  check(!/pink nurses/i.test(vaultText), "the class code isn't in the saved copy");

  // Linking an existing code on another device needs no class code
  const B2 = await device("A-phone");
  const pl = await B2.newPage();
  await pl.goto(BASE + "start-tracking.html?from=home");
  await pl.waitForSelector("#st-qr svg");
  await pl.click("#st-link");
  await pl.fill("#st-linkcode", sa.code);
  await pl.click("#st-linkgo");
  await pl.waitForURL(url => !/start-tracking/.test(url));
  check((await state(pl)).nickname === sa.nickname, "linking a code on a new device: no class code asked");
  await pl.evaluate(() => { Tracking.update({goal: {type: "days", value: 3}}); Tracking.changed(); return Tracking.sync(); });
  check(await waitFor(async () => (await q("select version from public.vault"))[0].version > (sa.sync.version)), "saves from an existing code keep working (no class code needed)");

  // ---- B) Library ----
  /* Open the Library and search All units (the list starts empty until a search) */
  const search = async (pg, unit, topic) => {
    await pg.selectOption("#lb-funit", unit);
    if (topic) await pg.selectOption("#lb-ftopic", topic);
    await pg.click("#lb-search");
  };
  const lib = async pg => {
    await pg.goto(BASE + "library.html"); await pg.waitForSelector("#lb-form"); await pg.waitForSelector("#lb-list .ch-note");
    if (await pg.isEnabled("#lb-funit") && await pg.$("#lb-funit option[value='*']")) await search(pg, "*");
    await pg.waitForSelector("#lb-list .lb-card, #lb-list .ch-note");
  };
  await lib(pa);
  check(/No patient information/.test(await text(pa, ".lb-rules")) && /No test content/.test(await text(pa, ".lb-rules")), "the two sharing rules are at the top");
  check(await pa.inputValue("#lb-name") === "" && await pa.getAttribute("#lb-name", "placeholder") === "Your name or nickname", "the name to show starts blank, typed by the student");
  check(await pa.$eval('.ms-nav a[href="library.html"]', a => a.classList.contains("is-current")), "Library tab in My study");
  check(await pa.isVisible("#lb-open") && !(await pa.isVisible("#lb-file")), "the Share box starts small, closed");
  await pa.click("#lb-open"); await pa.click("#lb-close");
  check(!(await pa.isVisible("#lb-file")), "Cancel closes it again");
  await pa.click("#lb-open");
  check(await pa.isVisible("#lb-file"), "+ Share a file opens the form");
  check(await pa.$eval("#lb-upload", b => b.disabled), "Share is disabled until both boxes are ticked");
  const pickUnits = async (pg, list) => {
    if (await pg.isChecked('#lb-units input[value="all"]')) await pg.uncheck('#lb-units input[value="all"]');
    for (const u of list) await pg.check(`#lb-units input[value="${u}"]`);
  };
  const pickTopics = async (pg, list) => {
    if (await pg.isChecked('#lb-topics input[value="all"]')) await pg.uncheck('#lb-topics input[value="all"]');
    for (const t of list) await pg.check(`#lb-topics input[value="${t}"]`);
  };
  const openForm = async pg => { if (await pg.isVisible("#lb-open")) await pg.click("#lb-open"); };
  const upload = async (pg, f, opts = {}) => {
    await openForm(pg);
    await pg.setInputFiles("#lb-file", f);
    await pg.fill("#lb-title", opts.title || f.name);
    await pg.fill("#lb-desc", opts.desc || "");
    if (opts.units) await pickUnits(pg, opts.units);
    if (opts.topics) await pickTopics(pg, opts.topics);
    if (opts.anon) await pg.check('#lb-form input[name="show"][value="anon"]');
    else await pg.fill("#lb-name", opts.name || "Kayla R.");
    await pg.check("#lb-ok1"); await pg.check("#lb-ok2");
    await pg.click("#lb-upload");
    await pg.waitForFunction(() => !/Sharing/.test(document.getElementById("lb-upload").textContent));
    return text(pg, "#lb-msg");
  };
  const results = {};
  results.pdf = await upload(pa, FILES.pdf, {title: "Wound care notes", desc: "Stages and dressings", units: ["nur114:U-03"], topics: ["nur114:U-03:tissue-integrity"]});
  await lib(pa);
  check(await pa.inputValue("#lb-name") === "Kayla R.", "the typed name is remembered on this device for next time");
  results.jpg = await upload(pa, FILES.jpg, {title: "Chain of infection diagram", units: ["nur114:U-03"], topics: ["nur114:U-03:infection-control"], anon: true});
  await lib(pa);
  for (const k of ["png", "webp", "heic", "doc", "docx"]) { results[k] = await upload(pa, FILES[k]); await lib(pa); }
  check(Object.values(results).every(m => /Shared!/.test(m)), "uploads: PDF, JPG, PNG, WEBP, HEIC, DOC and DOCX all accepted", JSON.stringify(results).slice(0, 120));
  const rows = await q("select title, file_name, mime, size, display_name, units, topics, owner_hash from public.shared_files order by created_at");
  check(rows.length === 7 && R2().length === r0 + 7, "7 files: 7 database rows and 7 objects in the bucket");
  check(rows[0].display_name === "Kayla R." && rows[1].display_name === null && rows.every(r => r.owner_hash.length === 64 && !r.owner_hash.includes(sa.sync.lookup)),
    "shown as the name or Anonymous; owner kept only as a hash");
  check(rows[4].file_name === "IMG_0042.heic" && rows[6].file_name === "Study guide.docx" && rows[0].mime === "application/pdf", "file names and types come from the file's contents", rows.map(r => r.file_name).join(", "));
  await pa.screenshot({path: OUT + "/lib-page.png", fullPage: true});

  // Rejections (in the page, and straight at the server)
  for (const [k, f] of Object.entries(BAD)) {
    const m = await upload(pa, f);
    check(/Only PDF, JPG, PNG, WEBP, HEIC and Word/.test(m), "rejected by contents: " + k + " (" + f.name + ")", m.slice(0, 60));
    await lib(pa);
  }
  const big = {name: "huge.pdf", mimeType: "application/pdf", buffer: Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(21 * 1024 * 1024)])};
  const bigMsg = await (async () => { await openForm(pa); await pa.setInputFiles("#lb-file", big); await pa.fill("#lb-title", "big"); await pa.check("#lb-ok1"); await pa.check("#lb-ok2"); await pa.click("#lb-upload"); return text(pa, "#lb-msg"); })();
  check(/up to 20 MB/.test(bigMsg), "21 MB file: told files can be up to 20 MB", bigMsg);
  const serverBig = await pa.evaluate(async () => {
    const k = await Tracking.ensureKeys();
    const fd = new FormData();
    fd.append("lookup", k.lookup); fd.append("title", "big"); fd.append("units", '["all"]'); fd.append("topics", '["all"]');
    fd.append("show", "anon"); fd.append("noPatientInfo", "yes"); fd.append("noExamContent", "yes");
    const bytes = new Uint8Array(21 * 1024 * 1024); bytes.set([0x25, 0x50, 0x44, 0x46, 0x2D]);
    fd.append("file", new Blob([bytes], {type: "application/pdf"}), "big.pdf");
    const r = await fetch("api/library/upload", {method: "POST", body: fd});
    return r.status + " " + (await r.json()).error;
  });
  check(/^413 Files can be up to 20 MB/.test(serverBig), "server refuses files over 20 MB", serverBig);
  const serverNoBoxes = await pa.evaluate(async () => {
    const k = await Tracking.ensureKeys();
    const fd = new FormData();
    fd.append("lookup", k.lookup); fd.append("title", "x"); fd.append("units", '["all"]'); fd.append("topics", '["all"]'); fd.append("show", "anon");
    fd.append("file", new Blob([new TextEncoder().encode("%PDF-1.4 hello world")], {type: "application/pdf"}), "x.pdf");
    const r = await fetch("api/library/upload", {method: "POST", body: fd});
    return r.status + " " + (await r.json()).error;
  });
  check(/^400 Tick both boxes/.test(serverNoBoxes), "server refuses an upload without both sharing boxes", serverNoBoxes);
  const notTracking = await pa.evaluate(async () => {
    const r = await fetch("api/library/list", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({lookup: Tracking.randomHex(32)})});
    return r.status;
  });
  check(notTracking === 403 && (await q("select count(*)::int n from public.shared_files"))[0].n === 7, "an unknown tracking code can't list files; nothing extra was stored");

  // Filters (files tagged All show under every filter)
  await pa.goto(BASE + "library.html"); await pa.waitForSelector("#lb-list .ch-note");
  check(!(await pa.$("#lb-list .lb-card")) && /Choose a unit and a topic, then Search/.test(await text(pa, "#lb-list")) && /7 files shared/.test(await text(pa, "#lb-count")) &&
        await pa.$eval("#lb-funit", s => s.selectedOptions[0].textContent) === "Choose a unit" && await pa.isDisabled("#lb-ftopic") && await pa.isDisabled("#lb-search"),
    "Files start empty: Choose a unit / topic, Search disabled until a unit is picked");
  await pa.screenshot({path: OUT + "/lib-start.png", fullPage: true});
  await pa.selectOption("#lb-funit", "nur114:U-01");
  check(!(await pa.$("#lb-list .lb-card")) && await pa.isEnabled("#lb-search"), "picking a unit doesn't list anything until Search");
  const titles = async () => pa.$$eval("#lb-list .lb-card h3", h => h.map(x => x.textContent));
  await search(pa, "*");
  check((await titles()).length === 7 && /7 of 7 files/.test(await text(pa, "#lb-count")), "All units: all 7 files listed");
  await search(pa, "nur114:U-01");
  check((await titles()).length === 5 && !(await titles()).includes("Wound care notes"), "filter Unit 1: the 5 All-units files, not the Unit 3 ones", (await titles()).length);
  await search(pa, "nur114:U-03");
  check((await titles()).length === 7, "filter Unit 3: its 2 files plus the 5 All-units files");
  await search(pa, "nur114:U-03", "nur114:U-03:tissue-integrity");
  const ti = await titles();
  check(ti.includes("Wound care notes") && !ti.includes("Chain of infection diagram") && ti.length === 6, "filter Tissue Integrity: its file plus the All-topics files", ti.length);
  await pa.screenshot({path: OUT + "/lib-filtered.png", fullPage: true});

  // Download (served as an attachment with the right bytes)
  const card = pa.locator(".lb-card", {hasText: "Wound care notes"});
  const [dl] = await Promise.all([pa.waitForEvent("download"), card.locator(".lb-download").click()]);
  const saved = await dl.path();
  check(dl.suggestedFilename() === "wound-care.pdf" && fs.readFileSync(saved).equals(FILES.pdf.buffer), "download: the same file, as wound-care.pdf", dl.suggestedFilename());
  const head = await pa.evaluate(async () => {
    const k = await Tracking.ensureKeys();
    const list = await Tracking.call("library/list", {lookup: k.lookup});
    const link = await Tracking.call("library/link", {lookup: k.lookup, id: list[0].id});
    const r = await fetch(link.url);
    // Change a character in the middle of the signature (the last one can differ only in unused padding bits)
    const i = link.url.length - 10, c = link.url[i];
    const forged = await fetch(link.url.slice(0, i) + (c === "A" ? "B" : "A") + link.url.slice(i + 1));
    return [r.headers.get("Content-Disposition"), forged.status];
  });
  check(/^attachment; filename=/.test(head[0]) && head[1] === 403, "served with Content-Disposition: attachment; a tampered link is refused", head[0]);

  // Another student: sees everything, can delete nothing of A's
  const B = await device("B");
  const pb = await B.newPage();
  await pb.goto(BASE + "start-tracking.html?from=home");
  await pb.waitForSelector("#st-qr svg");
  await pb.click("#st-start");
  await pb.fill("#st-class", "Pink Nurses 26");
  await pb.click("#st-classgo");
  await pb.waitForURL(BASE);
  await waitFor(async () => { const s = await state(pb); return s && s.sync && s.sync.version > 0; });
  await lib(pb);
  check((await pb.$$eval("#lb-list .lb-card", c => c.length)) === 7 && (await pb.$$("#lb-list .lb-delete")).length === 0, "another student sees all 7 files and no Delete buttons");
  check(/Chain of infection diagram.*Anonymous/.test(await text(pb, "#lb-list")), "the anonymous upload shows as Anonymous");
  const bDelete = await pb.evaluate(async () => {
    const k = await Tracking.ensureKeys();
    const list = await Tracking.call("library/list", {lookup: k.lookup});
    return Tracking.call("library/delete", {lookup: k.lookup, id: list[0].id});
  });
  check(bDelete === false && R2().length === r0 + 7, "deleting someone else's file through the API does nothing");
  const pageSrc = (await pb.content()) + (await pb.evaluate(() => [...document.scripts].map(x => x.src).join(" ")));
  check(!/library-admin|admin\/(list|delete)|LIBRARY_ADMIN|is-admin/i.test(pageSrc), "no sign of an admin role on the page");

  // Own delete (with a confirm)
  await lib(pa);
  check((await pa.$$("#lb-list .lb-delete")).length === 7, "the uploader sees Delete on their own files");
  await pa.locator(".lb-card", {hasText: "Chain of infection diagram"}).locator(".lb-delete").click();
  await waitFor(async () => (await pa.$$("#lb-list .lb-card")).length === 6);
  check((await q("select count(*)::int n from public.shared_files"))[0].n === 6 && R2().length === r0 + 6, "own delete: removed from the database and the bucket");

  // Hidden admin page
  const G = await device("owner");
  const pg = await G.newPage();
  await pg.goto(BASE + "library-admin");
  await pg.fill("#k", "wrong key");
  await pg.click("#f button");
  await pg.waitForFunction(() => document.getElementById("m").textContent);
  check(/not allowed/i.test(await text(pg, "#m")), "admin page: wrong key shows nothing");
  await pg.fill("#k", ADMIN_KEY);
  await pg.click("#f button");
  await pg.waitForSelector("#l li");
  check((await pg.$$("#l li")).length === 6, "admin page: right key lists every file");
  await pg.locator("#l li", {hasText: "Wound care notes"}).locator("button").click();
  await waitFor(async () => (await pg.$$("#l li")).length === 5);
  check((await q("select count(*)::int n from public.shared_files"))[0].n === 5 && R2().length === r0 + 5 && !(await q("select 1 from public.shared_files where title = 'Wound care notes'")).length,
    "admin delete: someone else's file removed from the database and the bucket");
  const adminNoKey = await pa.evaluate(async () => (await fetch("api/library/admin/list", {method: "POST", headers: {"Content-Type": "application/json"}, body: "{}"})).status);
  check(adminNoKey === 403, "admin API refuses without the key");
  const links = await pa.$$eval("a", a => a.map(x => x.getAttribute("href")).filter(h => /library-admin/.test(h || "")));
  check(links.length === 0, "the admin page isn't linked from the site");

  // Preview (B shares three real files; uploads by A are near the hourly limit)
  await lib(pb);
  await upload(pb, REAL.png, {title: "Dot picture"}); await lib(pb);
  await upload(pb, REAL.docx, {title: "Stages handout"}); await lib(pb);
  await upload(pb, REAL.pdf, {title: "PDF handout"}); await lib(pb);
  const pcard = t => pb.locator(".lb-card", {hasText: t});
  check(await pcard("old notes.doc").locator(".lb-preview").count() === 0 && await pcard("Stages handout").locator(".lb-preview").count() === 1 &&
        await pcard("Dot picture").locator(".lb-preview").count() === 1 && await pcard("PDF handout").locator(".lb-preview").count() === 1,
    "Preview on pictures, PDFs and .docx; none on old .doc files");
  await pcard("Dot picture").locator(".lb-preview").click();
  await pb.waitForSelector("#lb-viewer .lb-vimg");
  check(await pb.$eval("#lb-viewer", d => d.open) && await pb.$eval(".lb-vimg", i => i.naturalWidth) === 1 && await text(pb, "#lb-vtitle") === "Dot picture", "picture preview: shown in the pop-up");
  await pb.click("#lb-vclose");
  check(!(await pb.$eval("#lb-viewer", d => d.open)), "the pop-up closes");
  await pcard("IMG_0042.HEIC").locator(".lb-preview").click();
  await pb.waitForSelector("#lb-viewer .lb-vnote:not(:empty)");
  await waitFor(async () => /HEIC/.test(await text(pb, "#lb-vbody")));
  check(/can't show HEIC/.test(await text(pb, "#lb-vbody")), "HEIC in a browser that can't show it: told to download");
  await pb.click("#lb-vclose");
  await pcard("Stages handout").locator(".lb-preview").click();
  await pb.waitForSelector("#lb-viewer iframe.lb-vdoc");
  const doc = await pb.$eval("#lb-viewer iframe.lb-vdoc", f => ({sandbox: f.getAttribute("sandbox"), html: f.srcdoc}));
  check(doc.sandbox === "" && /Pressure injury stages/.test(doc.html) && /Stage 1: intact skin/.test(doc.html), "Word preview: the text, in a frame that can't run scripts");
  const [dl2] = await Promise.all([pb.waitForEvent("download"), pb.click("#lb-vdownload")]);
  check(dl2.suggestedFilename() === "stages.docx", "Download from the preview");
  await pb.click("#lb-vclose");
  /* (The test browser has no PDF viewer, so it saves the file instead; check the new tab asked for the preview link) */
  const pdfReq = pb.context().waitForEvent("request", r => /api\/library\/file\/.*[?]t=/.test(r.url()) && r.frame().page() !== pb);
  const [pop] = await Promise.all([pb.waitForEvent("popup"), pcard("PDF handout").locator(".lb-preview").click()]);
  check(!!(await pdfReq.catch(() => null)), "PDF preview: opens in a new tab");
  await pop.close().catch(() => {});
  const heads = await pb.evaluate(async () => {
    const k = await Tracking.ensureKeys();
    const list = await Tracking.call("library/list", {lookup: k.lookup});
    const get = async (title, view) => {
      const f = list.find(x => x.title === title);
      const r = await fetch((await Tracking.call("library/link", {lookup: k.lookup, id: f.id, view})).url);
      return [r.headers.get("Content-Disposition").split(";")[0], r.headers.get("Content-Security-Policy") || ""];
    };
    return {pdf: await get("PDF handout", true), png: await get("Dot picture", true), pngDl: await get("Dot picture", false), docx: await get("Stages handout", true)};
  });
  check(heads.pdf[0] === "inline" && heads.png[0] === "inline" && /sandbox/.test(heads.png[1]) && heads.pngDl[0] === "attachment" && heads.docx[0] === "attachment",
    "preview links show in the browser (pictures sandboxed); downloads and Word files stay attachments", JSON.stringify(heads));

  check(errors.length === 0, "no page errors", JSON.stringify(errors));
  await b.close();
  await db.end();
  console.log(failures ? failures + " FAILED" : "all library checks passed");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
