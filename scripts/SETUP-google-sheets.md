# Google Sheets Logging Setup

How to mirror every Netlify form submission into a Google Sheet. Takes
about ten minutes; no code changes to the repo are required.

> **Architecture**
>
> ```
> Form submit → Netlify Forms → Outgoing webhook → Apps Script Web app → Google Sheet
> ```
>
> Submissions still land in the Netlify dashboard as before; the Sheet is
> a parallel copy that's easier to share, sort, filter, and export.

---

## 1. Create the spreadsheet

1. Open <https://sheets.new> while logged in as the account that should
   own the data (suggest using `bill@zionlutherfairbanks.org` so it's not
   tied to a personal Google account).
2. Rename it: **CR 20th Anniversary — Registrations**.
3. Don't bother creating tabs by hand — the script creates them on the
   first submission with proper headers and formatting.

## 2. Paste the script

1. In the sheet, choose **Extensions → Apps Script**. A new browser tab
   opens.
2. Delete the placeholder `function myFunction() {}`.
3. Open `scripts/google-sheets-webhook.gs` from this repo, copy the
   entire file, and paste it into the editor.
4. (Optional, recommended) Set `SECRET` near the top of the file to a
   random string — e.g. `"L9k2-cr-zion"`. Save the script with the
   floppy-disk icon (or ⌘S).

## 3. Deploy as a Web app

1. Click **Deploy → New deployment** (top right).
2. Click the gear next to "Select type" → choose **Web app**.
3. Fill in:
   - **Description:** `Netlify Forms webhook`
   - **Execute as:** **Me** (the Sheet owner)
   - **Who has access:** **Anyone** (must be Anyone, not "Anyone with a
     Google account" — Netlify's webhook isn't authenticated)
4. Click **Deploy**.
5. Apps Script will ask you to authorise it (one-time). Pick the same
   Google account, get past the "unverified app" warning by clicking
   **Advanced → Go to … (unsafe)** — that warning is normal for personal
   scripts; you wrote it, so the warning is for your benefit.
6. Copy the **Web app URL** that Apps Script returns. It looks like:
   ```
   https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/exec
   ```
   If you set a `SECRET`, append `?key=<your-secret>` to the URL.

> **Whenever you edit the script later** you must redeploy: **Deploy →
> Manage deployments → pencil icon → Version: New version → Deploy**.
> Otherwise the changes don't go live.

## 4. Smoke-test the script

Inside the Apps Script editor:

1. In the function dropdown at the top, select `_selfTest`.
2. Click **Run**. Authorise again if prompted.
3. Switch back to the Sheet — you should see a new tab **Registrations**
   with bold navy headers and one test row. Delete the test row when
   you're satisfied. Leave the headers and tab.

If anything fails, the **Execution log** in Apps Script (View → Logs)
shows what went wrong.

## 5. Wire Netlify to the webhook

1. In the Netlify dashboard, open the site
   `celebraterecoveryzion.com`.
2. Go to **Forms → Form notifications** (left sidebar) → **Add
   notification → Outgoing webhook**.
3. Fill in:
   - **Event to listen for:** `New form submission`
   - **URL to notify:** the Apps Script Web-app URL from step 3 (with
     `?key=…` appended if you set a secret)
   - **Form:** leave blank to capture **all** forms — this lets one
     webhook handle both `cr-registration` and `cr-contact`. The script
     routes them to separate tabs automatically.
4. **Save**.

## 6. Verify end-to-end

1. Open the live site, fill out a real-looking registration, submit.
2. Within a few seconds, check the Sheet — a new row should appear in
   the **Registrations** tab.
3. Try the contact modal too — that should land in **Contact Messages**.
4. If a row doesn't appear:
   - Netlify dashboard → Forms → click the submission → look at
     "Notifications" — it'll show whether the webhook fired and the
     response.
   - Apps Script → Executions tab — every webhook call shows up here
     with its return value and any errors.

## Form fields captured

### Registrations tab
`Submitted (UTC)`, `First Name`, `Last Name`, `Phone`, `Email`, `Gender`,
`Attendance`, `Open Share Groups`, `Small Group`, `$20 Fee Agreed`,
`T-Shirt Size`, `Overnight Stay`, `Salmon Bake`, `Source IP`,
`User Agent`.

### Contact Messages tab
`Submitted (UTC)`, `Name`, `Email`, `Subject`, `Message`, `Source IP`,
`User Agent`.

## Sharing the sheet

Once submissions are flowing, give Liz/Bill **View** or **Comment**
access via the Sheet's **Share** button. Don't give Edit access to
people who don't need it — accidental edits to the headers will break
the column alignment.

## Cost

Free. Apps Script and Netlify Forms (under the free 100/month tier)
both cost nothing. If you exceed Netlify's free form quota, the
overage is $19/month.
