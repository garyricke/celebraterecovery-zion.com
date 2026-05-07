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

const REG_HEADERS = [
  "Submitted (UTC)",
  "First Name",
  "Last Name",
  "Phone",
  "Email",
  "Gender",
  "Attendance",
  "Open Share Groups",
  "Small Group",
  "$20 Fee Agreed",
  "T-Shirt Size",
  "Overnight Stay",
  "Salmon Bake",
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
    appendRow_(ss, "Registrations", REG_HEADERS, [
      meta.submitted,
      data["first-name"]          || "",
      data["last-name"]           || "",
      data.phone                  || "",
      data.email                  || "",
      data.gender                 || "",
      data.attendance             || "",
      data["open-share"]          || "",
      data["small-group"]         || "",
      data["saturday-fee-agree"]  || "",
      data["tshirt-size"]         || "",
      data.overnight              || "",
      data["salmon-bake"]         || "",
      meta.ip,
      meta.ua,
    ]);
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


function jsonResponse(obj, status) {
  // Apps Script doesn't expose status codes on web-app responses, but we
  // can still surface the intent in the JSON body for client-side debug.
  if (status && status >= 400) obj.status = status;
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


/** Manual smoke-test inside the Apps Script editor.
 *  Run this once to confirm the headers + sheet creation logic works. */
function _selfTest() {
  doPost({
    parameter: { key: SECRET },
    postData: {
      contents: JSON.stringify({
        form_name: "cr-registration",
        created_at: new Date().toISOString(),
        data: {
          "first-name": "Test",
          "last-name": "User",
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
  Logger.log("Self-test row appended. Check the 'Registrations' tab.");
}
