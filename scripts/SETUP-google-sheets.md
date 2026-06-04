# Google Sheets Logging Setup

How the conference registration data flows into a single Google Sheet
that captures **both** website submissions and the walk-in / phone
signups the client types in by hand. Setup takes about 20 minutes
end-to-end the first time; nothing in this repo needs to change after.

> **Architecture**
>
> ```
> Website form → Netlify Forms → Outgoing webhook ─┐
>                                                  ├─→  Google Sheet
> Client types walk-in registration into sheet  ───┘
> ```
>
> The sheet is the single source of truth for the roster. Netlify still
> archives a copy of each online submission in its own dashboard, but
> the sheet is where Liz/Bill work day-to-day.

## What you're replacing

The existing Jotforms-export sheet uses a tally-grid layout (stacked
multi-row headers, 1/0 cells for every gender/size/sleeping slot,
hand-computed totals row, notes embedded inside the email column). A
webhook submission can't be appended to that shape without overwriting
the wrong columns. We're rebuilding as a **flat list** — one row per
registrant, one value per cell — and adding a **Summary tab** with
COUNTIF formulas that automatically recreate the totals the client was
keeping by hand.

The previous 30 registrants (29 after dropping Evelyn Horne, who
requested info but didn't sign up) get migrated into the new layout
by a one-shot script in this repo. See
[Step 4](#4-import-the-migrated-manual-entries) below.

---

## 1. Create the new spreadsheet

1. Open <https://sheets.new> while signed in as the account that should
   own the data — suggest `bill@zionlutheranfairbanks.org` so it isn't
   tied to a personal account.
2. Rename it: **CR 20th Anniversary — Registrations**.
3. Don't add tabs by hand — the script creates `Registrations` on the
   first webhook fire, and `_setupSummaryTab` creates the `Summary` tab
   (see Step 5).

## 2. Paste the script

1. In the new sheet: **Extensions → Apps Script**. A new tab opens.
2. Delete the placeholder `function myFunction() {}`.
3. Open `scripts/google-sheets-webhook.gs` from this repo, copy the
   whole file, paste it in.
4. (Optional but recommended) Set `SECRET` at the top to a random
   string — e.g. `"L9k2-cr-zion"`. Save with the floppy-disk icon
   (or ⌘S).

## 3. Deploy as a Web app

1. Top right: **Deploy → New deployment**.
2. Gear next to "Select type" → **Web app**.
3. Fill in:
   - **Description:** `Netlify Forms webhook`
   - **Execute as:** **Me** (the sheet owner)
   - **Who has access:** **Anyone** — must be "Anyone", not "Anyone
     with a Google account", because Netlify's webhook isn't
     authenticated.
4. **Deploy** → authorise (one-time). Pick the same Google account; get
   past the "unverified app" warning via **Advanced → Go to … (unsafe)**
   — that warning is normal for personal scripts.
5. Copy the **Web app URL** Apps Script returns:
   ```
   https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxx/exec
   ```
   If you set a `SECRET`, append `?key=<your-secret>` to the URL.

> **When you edit the script later** you must redeploy: **Deploy →
> Manage deployments → pencil icon → Version: New version → Deploy.**
> Otherwise the change doesn't go live.

## 4. Import the migrated manual entries

This is the rebuild step — runs once, brings every prior hand-keyed
registrant into the new flat layout.

1. Generate the migrated CSV locally:
   ```sh
   python3 scripts/migrate-jotforms-data.py \
     "/path/to/Data from 20th Anniversary Jotforms.xlsx"
   ```
   This writes `scripts/registrations-migrated.csv` (29 rows).
2. In the Apps Script editor, function dropdown → **`_selfTest`** →
   **Run**. This creates the `Registrations` tab with the correct
   headers in the correct order and appends a single test row.
3. Switch back to the sheet, open the **Registrations** tab, **delete
   the test row** but leave the header row untouched.
4. Open `scripts/registrations-migrated.csv` in a text editor (or in
   Numbers / Excel), select everything from row 2 onward (skip the
   header — the sheet already has it), copy.
5. In the sheet, click cell **A2**, paste. Google offers "Paste as
   plain text" / "Split text to columns" — pick **Split**. 29 rows
   land under the headers, every column aligned.
6. Spot-check the **Notes** column — six rows are flagged for the
   client to review:
   - Stephanie Richardson — gender/Open-Share mismatch in source
   - Nenette Rogers — leader status was `?` in original
   - Ken Severin — placeholder phone/email (`123-456-7890`,
     `myemail@example.com`)
   - William Slayden — goes by "Bill"
   - Jackie Smith — lodging "motor home"
   - Liberty Vigran — volunteer

## 5. Build the Summary tab

Recreates the hand-tallied totals from the old sheet — gender split,
attendance split, T-shirt sizes, sleeping slots, salmon-bake count,
leader count, paid/comp/pending counts. Formulas auto-refresh as new
rows arrive.

1. In the Apps Script editor, function dropdown → **`_setupSummaryTab`**
   → **Run**. Authorise if asked.
2. Switch to the sheet — there's now a **Summary** tab pinned to the
   left of `Registrations`. Read down the labels; the counts should
   roughly match what Liz/Bill had been keeping in row 4 of the old
   sheet (give or take any data corrections from the Notes review).

To rebuild Summary later (e.g. after the migration corrections), just
run `_setupSummaryTab` again — it deletes and recreates the tab.

## 6. Wire Netlify to the webhook

1. Netlify dashboard → site `celebraterecoveryzion.com`.
2. **Forms → Form notifications → Add notification → Outgoing
   webhook**.
3. Fill in:
   - **Event:** `New form submission`
   - **URL to notify:** the Apps Script Web-app URL from Step 3 (with
     `?key=…` appended if you set a secret)
   - **Form:** leave blank to capture **all** forms — one webhook
     handles both `cr-registration` and `cr-contact`; the script
     routes them to separate tabs.
4. **Save**.

## 7. Verify end-to-end

1. Open the live site, fill out a real-looking registration, submit.
2. Within a few seconds the new row appears in **Registrations** with
   `Source = Online`.
3. Try the contact modal — that lands in **Contact Messages**.
4. If nothing appears:
   - Netlify dashboard → Forms → click the submission →
     "Notifications" shows whether the webhook fired and the response.
   - Apps Script → **Executions** tab — every webhook call appears
     with return value and any errors.

---

## How the columns work

### Registrations tab (19 columns)

| # | Column | Source on online submits | Manual workflow |
|---|---|---|---|
| 1 | Submitted | webhook timestamp (UTC) | leave blank or type date |
| 2 | Source | `Online` | `Manual` / `Comp` / `Volunteer` / `Inquiry` |
| 3 | First Name | form | type |
| 4 | Last Name | form | type |
| 5 | Phone | form | type |
| 6 | Email | form | type |
| 7 | Gender | `Male` / `Female` | type |
| 8 | Attendance | `Friday only` / `Saturday only` / `Both days` | type |
| 9 | Open Share Groups | `Yes` / `No` | type |
| 10 | Small Group | `Addictions/Dependencies` / `Other Hurts/Hang-ups/Habits` | type |
| 11 | Leader | (blank) | `Yes` / blank |
| 12 | Paid | `Yes` (form fee box checked) / `Pending` | `Yes` / `Comp` / `Pending` |
| 13 | T-Shirt Size | `XS` / `S` / `M` / `L` / `XL` / `Other` | + `XXL` / `3XL` |
| 14 | Overnight Stay | `Friday night only` / `Saturday night only` / `Both nights` / blank | + `Other` |
| 15 | Salmon Bake | `Yes` / `No` | type |
| 16 | Notes | (blank) | free text |
| 17 | Entered By | (blank) | client initials |
| 18 | Source IP | webhook | — |
| 19 | User Agent | webhook | — |

The script writes by header *name*, not column position — so the
client can reorder columns, hide tech columns (18, 19), or insert
helper columns without breaking ingestion. Don't rename the header
text, though; that's the lookup key.

### Contact Messages tab

`Submitted (UTC)`, `Name`, `Email`, `Subject`, `Message`, `Source IP`,
`User Agent`.

---

## Sharing the sheet

Once data is flowing, give Liz/Bill **Editor** access (they need to
type in walk-ins). Avoid Editor access for anyone who doesn't need it
— accidental edits to the header row break the column alignment.

## Cost

Free. Apps Script and Netlify Forms (under 100 submissions/month) both
cost nothing. If you exceed Netlify's free form quota, the overage is
$19/month.
