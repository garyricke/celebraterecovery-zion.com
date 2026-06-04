/**
 * Google Apps Script — Netlify Forms → Google Sheet logger
 * ─────────────────────────────────────────────────────────
 *
 * Bound to a Google Sheet as a container script (Extensions → Apps Script
 * from inside the sheet). When deployed as a Web app, Netlify can POST
 * each form submission here and we'll append it as a new row.
 *
 * Routes by `form_name`:
 *   cr-registration  →  tab "Registrations"
 *   cr-contact       →  tab "Contact Messages"
 *
 * If a tab does not exist, it is created with appropriate headers.
 *
 * — Optional shared-secret check —
 * Set SECRET below to a random string and append `?key=<that string>` to
 * the deployed Web-app URL when configuring the Netlify webhook. Leave
 * SECRET as "" to disable the check (the URL itself is the secret).
 */

const SECRET = ""; // e.g. "L9k2-cr-zion" — must match ?key=… in Netlify webhook URL

// Keep this list in lock-step with the headers in the live sheet. The
// script identifies column positions by *name* at write time (see
// appendByMap_ below), so reordering or inserting columns in the sheet
// is safe as long as the header text matches.
const REG_HEADERS = [
  "Submitted",          // ISO timestamp the webhook fired (UTC)
  "Source",             // Online / Manual / Comp / Volunteer / Inquiry
  "First Name",
  "Last Name",
  "Phone",
  "Email",
  "Gender",
  "Attendance",
  "Open Share Groups",
  "Small Group",
  "Leader",             // manual-fill; webhook leaves blank
  "Paid",               // Yes / Comp / Pending
  "T-Shirt Size",
  "Overnight Stay",
  "Salmon Bake",
  "Notes",              // manual-fill; webhook leaves blank
  "Entered By",         // manual-fill; webhook leaves blank
  "Source IP",
  "User Agent",
];

const CONTACT_HEADERS = [
  "Submitted (UTC)",
  "Name",
  "Email",
  "Subject",
  "Message",
  "Source IP",
  "User Agent",
];


function doPost(e) {
  // 1. Optional shared-secret gate
  if (SECRET && (e.parameter.key || "") !== SECRET) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  // 2. Parse the Netlify webhook payload
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ ok: false, error: "bad-json" }, 400);
  }

  // 2b. Idempotency: Apps Script Web apps return a 302 from /exec to
  // script.googleusercontent.com, and some webhook senders (Netlify
  // among them) end up POSTing to both endpoints, which fires doPost
  // twice for one logical event. Hash the payload and skip duplicates
  // we've seen in the last 60 seconds.
  if (isDuplicate_(body)) {
    return jsonResponse({ ok: true, deduped: true });
  }

  const formName = body.form_name || "unknown";
  const data     = body.data       || {};
  const meta     = {
    submitted: body.created_at || new Date().toISOString(),
    ip:        body.remote_ip  || data.ip        || "",
    ua:        body.user_agent || data.user_agent || "",
  };

  // 3. Route to the appropriate sheet tab
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (formName === "cr-registration") {
    // Map by header name. Columns not listed here (Leader, Notes,
    // Entered By) are left blank for the client to fill in by hand.
    appendByMap_(ss, "Registrations", REG_HEADERS, {
      "Submitted":         meta.submitted,
      "Source":            "Online",
      "First Name":        data["first-name"] || "",
      "Last Name":         data["last-name"]  || "",
      "Phone":             data.phone         || "",
      "Email":             data.email         || "",
      "Gender":            data.gender        || "",
      "Attendance":        data.attendance    || "",
      "Open Share Groups": data["open-share"] || "",
      "Small Group":       data["small-group"] || "",
      "Paid":              data["saturday-fee-agree"] ? "Yes" : "Pending",
      "T-Shirt Size":      data["tshirt-size"] || "",
      "Overnight Stay":    data.overnight     || "",
      "Salmon Bake":       data["salmon-bake"] || "",
      "Source IP":         meta.ip,
      "User Agent":        meta.ua,
    });
  } else if (formName === "cr-contact") {
    appendRow_(ss, "Contact Messages", CONTACT_HEADERS, [
      meta.submitted,
      data.name    || "",
      data.email   || "",
      data.subject || "",
      data.message || "",
      meta.ip,
      meta.ua,
    ]);
  } else {
    // Unknown form — log to a fallback tab so nothing is lost
    appendRow_(ss, "Other Submissions",
      ["Submitted (UTC)", "Form Name", "Raw Payload"],
      [meta.submitted, formName, JSON.stringify(body)]);
  }

  return jsonResponse({ ok: true, form: formName });
}


/** Append a row, creating the tab + header row on first use. */
function appendRow_(ss, tabName, headers, row) {
  let tab = ss.getSheetByName(tabName);
  if (!tab) {
    tab = ss.insertSheet(tabName);
    tab.appendRow(headers);
    tab.setFrozenRows(1);
    tab.getRange(1, 1, 1, headers.length)
       .setFontWeight("bold")
       .setBackground("#0F1F5C")
       .setFontColor("#ffffff");
  }
  tab.appendRow(row);
}


/**
 * Append a row by header *name* instead of column index. Reads the live
 * header row and places each value under its matching column. Columns
 * not in `values` are left blank; columns in `values` whose header
 * isn't in the sheet are silently dropped (so renaming a header in the
 * sheet won't break the webhook — it just means that field stops
 * recording until you fix the name).
 *
 * If the tab doesn't exist, it's created using `defaultHeaders` in the
 * given order.
 */
function appendByMap_(ss, tabName, defaultHeaders, values) {
  let tab = ss.getSheetByName(tabName);
  if (!tab) {
    tab = ss.insertSheet(tabName);
    tab.appendRow(defaultHeaders);
    tab.setFrozenRows(1);
    tab.getRange(1, 1, 1, defaultHeaders.length)
       .setFontWeight("bold")
       .setBackground("#0F1F5C")
       .setFontColor("#ffffff");
  }

  const width   = Math.max(tab.getLastColumn(), defaultHeaders.length);
  const headers = tab.getRange(1, 1, 1, width).getValues()[0];

  const row = new Array(width).fill("");
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || "").trim();
    if (h && Object.prototype.hasOwnProperty.call(values, h)) {
      row[i] = values[h];
    }
  }
  tab.appendRow(row);
}


/**
 * Returns true if this exact payload was processed in the last 5 min.
 *
 * Hashes `form_name + created_at + JSON(data)` so retries with identical
 * content collapse, but a genuinely separate submission (different
 * `created_at`) still goes through.
 *
 * Why the lock: Apps Script Web Apps can execute multiple doPost calls
 * concurrently when a webhook fires several near-simultaneous POSTs
 * (Netlify retry storms, /exec → script.googleusercontent.com redirect
 * doubling, multiple downstream gateways). Without serialization, all
 * concurrent calls hit `cache.get` before any of them runs `cache.put`,
 * so every one of them sees an empty cache and writes a row — which is
 * how four identical-timestamp rows landed in the sheet on 2026-05-13.
 *
 * LockService.getScriptLock() is script-scoped, so it serializes
 * concurrent doPost executions of THIS deployment. The lock window only
 * covers the get-check-put — it doesn't hold across the sheet append,
 * so legitimate distinct submissions stay parallel.
 */
function isDuplicate_(body) {
  const lock = LockService.getScriptLock();
  try {
    // 10s is generous; CacheService roundtrips are <100ms in practice.
    lock.waitLock(10000);
  } catch (lockErr) {
    // Better to risk a duplicate than to drop the submission entirely.
    Logger.log("isDuplicate_ could not acquire lock: %s", lockErr);
    return false;
  }
  try {
    const cache = CacheService.getScriptCache();
    const key   = "seen:" + Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      (body.form_name || "") + "|" +
      (body.created_at || "") + "|" +
      JSON.stringify(body.data || {})
    ).map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, "0")).join("");

    if (cache.get(key)) return true;
    cache.put(key, "1", 300);   // 5 minutes — covers slow Netlify retries
    return false;
  } finally {
    lock.releaseLock();
  }
}


function jsonResponse(obj, status) {
  // Apps Script doesn't expose status codes on web-app responses, but we
  // can still surface the intent in the JSON body for client-side debug.
  if (status && status >= 400) obj.status = status;
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


/**
 * One-shot helper: build the "Summary" tab with live COUNTIF formulas
 * that recreate every total the client was tallying by hand in the old
 * sheet (gender, attendance, open-share split, T-shirt sizes, sleeping
 * slots, salmon-bake, paid status). Re-running this rebuilds the tab.
 *
 * Run once from the Apps Script editor (Function dropdown → _setupSummaryTab
 * → Run). The formulas refresh automatically as new rows arrive.
 */
function _setupSummaryTab() {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const name = "Summary";

  let tab = ss.getSheetByName(name);
  if (tab) ss.deleteSheet(tab);
  tab = ss.insertSheet(name, 1);   // keep Summary in position 1

  const R = "Registrations";  // source tab

  // [label, formula-or-blank]. A blank formula renders as a section
  // heading. Counts exclude the inquiry rows (Source = "Inquiry") via
  // the Total Registrants line; per-category COUNTIFS just match values
  // directly, which is fine because inquiries leave those fields blank.
  const rows = [
    ["CR 20th Anniversary — Registration Summary", ""],
    ["", ""],
    ["Total registrants",
      `=COUNTA('${R}'!C2:C) - COUNTIF('${R}'!B2:B,"Inquiry")`],
    ["", ""],
    ["By gender", ""],
    ["  Male",   `=COUNTIF('${R}'!G2:G,"Male")`],
    ["  Female", `=COUNTIF('${R}'!G2:G,"Female")`],
    ["", ""],
    ["By attendance", ""],
    ["  Friday only",   `=COUNTIF('${R}'!H2:H,"Friday only")`],
    ["  Saturday only", `=COUNTIF('${R}'!H2:H,"Saturday only")`],
    ["  Both days",     `=COUNTIF('${R}'!H2:H,"Both days")`],
    ["", ""],
    ["Open Share (Friday)", ""],
    ["  Yes", `=COUNTIF('${R}'!I2:I,"Yes")`],
    ["  No",  `=COUNTIF('${R}'!I2:I,"No")`],
    ["  Addictions/Dependencies — Male",
      `=COUNTIFS('${R}'!J2:J,"Addictions/Dependencies",'${R}'!G2:G,"Male")`],
    ["  Addictions/Dependencies — Female",
      `=COUNTIFS('${R}'!J2:J,"Addictions/Dependencies",'${R}'!G2:G,"Female")`],
    ["  Other Hurts/Hang-ups/Habits — Male",
      `=COUNTIFS('${R}'!J2:J,"Other Hurts/Hang-ups/Habits",'${R}'!G2:G,"Male")`],
    ["  Other Hurts/Hang-ups/Habits — Female",
      `=COUNTIFS('${R}'!J2:J,"Other Hurts/Hang-ups/Habits",'${R}'!G2:G,"Female")`],
    ["", ""],
    ["Leaders", `=COUNTIF('${R}'!K2:K,"Yes")`],
    ["", ""],
    ["Paid status ($20 Saturday fee)", ""],
    ["  Paid (Yes)",  `=COUNTIF('${R}'!L2:L,"Yes")`],
    ["  Comped",      `=COUNTIF('${R}'!L2:L,"Comp")`],
    ["  Pending",     `=COUNTIF('${R}'!L2:L,"Pending")`],
    ["", ""],
    ["T-Shirt sizes", ""],
    ["  XS",  `=COUNTIF('${R}'!M2:M,"XS")`],
    ["  S",   `=COUNTIF('${R}'!M2:M,"S")`],
    ["  M",   `=COUNTIF('${R}'!M2:M,"M")`],
    ["  L",   `=COUNTIF('${R}'!M2:M,"L")`],
    ["  XL",  `=COUNTIF('${R}'!M2:M,"XL")`],
    ["  XXL", `=COUNTIF('${R}'!M2:M,"XXL")`],
    ["  3XL", `=COUNTIF('${R}'!M2:M,"3XL")`],
    ["  Other / unspecified",
      `=COUNTA('${R}'!C2:C) - COUNTIF('${R}'!B2:B,"Inquiry")` +
      ` - SUMPRODUCT(COUNTIF('${R}'!M2:M,{"XS","S","M","L","XL","XXL","3XL"}))`],
    ["", ""],
    ["Overnight at Zion", ""],
    ["  Friday only",     `=COUNTIF('${R}'!N2:N,"Friday night only")`],
    ["  Saturday only",   `=COUNTIF('${R}'!N2:N,"Saturday night only")`],
    ["  Both nights",     `=COUNTIF('${R}'!N2:N,"Both nights")`],
    ["  Other (see notes)", `=COUNTIF('${R}'!N2:N,"Other")`],
    ["", ""],
    ["Salmon Bake", ""],
    ["  Yes", `=COUNTIF('${R}'!O2:O,"Yes")`],
    ["  No",  `=COUNTIF('${R}'!O2:O,"No")`],
    ["", ""],
    ["Source breakdown", ""],
    ["  Online (website form)", `=COUNTIF('${R}'!B2:B,"Online")`],
    ["  Manual (typed in)",     `=COUNTIF('${R}'!B2:B,"Manual")`],
    ["  Comp",                  `=COUNTIF('${R}'!B2:B,"Comp")`],
    ["  Volunteer",             `=COUNTIF('${R}'!B2:B,"Volunteer")`],
    ["  Inquiry (not registered)", `=COUNTIF('${R}'!B2:B,"Inquiry")`],
    ["", ""],
    ["Last updated", `=NOW()`],
  ];

  tab.getRange(1, 1, rows.length, 2).setValues(rows);

  // Cosmetics: title row, section headings (rows with empty formula
  // column), column widths, and a number format on the count column.
  tab.getRange("A1:B1").merge()
     .setFontWeight("bold").setFontSize(14)
     .setBackground("#0F1F5C").setFontColor("#ffffff")
     .setHorizontalAlignment("center");

  for (let i = 0; i < rows.length; i++) {
    const [label, formula] = rows[i];
    if (label && !formula && i > 0) {
      tab.getRange(i + 1, 1, 1, 2)
         .setFontWeight("bold")
         .setBackground("#F1F2F6");
    }
  }

  tab.setColumnWidth(1, 280);
  tab.setColumnWidth(2, 120);
  tab.getRange("B3:B" + rows.length).setHorizontalAlignment("right");

  // Last-updated cell as a date/time stamp.
  const lastRow = rows.length;
  tab.getRange(lastRow, 2).setNumberFormat("yyyy-mm-dd hh:mm");

  Logger.log("Summary tab rebuilt with %s rows.", rows.length);
}


/** Manual smoke-test inside the Apps Script editor.
 *  Run this once to confirm the headers + sheet creation logic works.
 *  Append a test row, eyeball it in the Registrations tab, then delete it. */
function _selfTest() {
  doPost({
    parameter: { key: SECRET },
    postData: {
      contents: JSON.stringify({
        form_name: "cr-registration",
        created_at: new Date().toISOString(),
        data: {
          "first-name": "Test",
          "last-name": "User — DELETE ME",
          phone: "(907) 555-0100",
          email: "test@example.com",
          gender: "Female",
          attendance: "Both days",
          "open-share": "Yes",
          "small-group": "Other Hurts/Hang-ups/Habits",
          "saturday-fee-agree": "Yes",
          "tshirt-size": "M",
          overnight: "Both nights",
          "salmon-bake": "Yes",
        },
      }),
    },
  });
  Logger.log("Self-test row appended. Check the 'Registrations' tab and delete the test row.");
}
