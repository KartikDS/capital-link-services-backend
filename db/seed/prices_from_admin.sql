-- ---------------------------------------------------------------------------
-- The two price tables the website quotes from, as CLS's admin holds them.
--
-- Transcribed on 2026-08-25 from "Manage - Police Clearances" and
-- "Manage - Russian Visa Voucher" on capitallinkservices.com.au/admin. It exists
-- so a local database can show the real prices before a production dump has been
-- imported — nothing in the application reads this file, and nothing runs it for
-- you.
--
--   * SUPERSEDED BY THE REAL DUMP. Once CLS's export is loaded, delete this or
--     leave it unrun. The ids here are 1..n, not CLS's own, and an order lodged
--     against a made-up id is an order against the wrong voucher.
--   * DEV DATABASES ONLY. It empties both tables first. Never run it anywhere
--     that shares a database with CLS.
--   * DATA ONLY. No CREATE, ALTER or DROP — the schema is CLS's and this API
--     never issues DDL. See the README.
--
-- HOW TO RUN IT
--
-- In PowerShell — note the pipe. PowerShell has no `<` input redirection; it
-- reserves that operator and fails to parse the line, which looks exactly like
-- the script being broken:
--
--   Get-Content db\seed\prices_from_admin.sql -Raw |
--     & "C:\xampp\mysql\bin\mysql.exe" -u root clspubli_staging
--
-- In Git Bash or any POSIX shell:
--
--   "C:/xampp/mysql/bin/mysql.exe" -u root clspubli_staging < db/seed/prices_from_admin.sql
--
-- Substitute your own user and database if they differ from the local XAMPP
-- defaults. Then confirm the API serves it:
--
--   curl localhost:5000/api/lookups/police-clearances
--   curl localhost:5000/api/lookups/voucher-types
--
-- AND THEN RESTART THE NEXT DEV SERVER. The website caches published fees for an
-- hour (`CATALOGUE_REVALIDATE_SECONDS` in the frontend's src/config/api.ts), so a
-- page rendered before the seed keeps quoting the old prices long after the API
-- is serving the new ones. The API itself is not cached and updates immediately,
-- which is why curl can disagree with the browser.
-- ---------------------------------------------------------------------------

START TRANSACTION;

-- ---------------------------------------------------------------------------
-- tbl_police_clearances — the four rows of the admin's clearance list.
--
-- `price_additional` is what the order screen's "Additional applicants (N)" line
-- is charged at. The admin's *list* screen does not show it — it is on each row's
-- Edit form, the field labelled "Addition application in the same package"
-- (`price2` in ManagePoliceClearances/edit.html.twig). Read off the admin and
-- confirmed on 2026-08-25.
--
-- `name_additional` is deliberately left NULL. It is the caption under that line,
-- the website has signed-off copy for it ("Each further applicant on the same
-- application"), and a NULL means CLS's own wording is not overwritten with a
-- guess. Set it only if their Edit form says something different that should show.
--
-- Never blank the price column. A NULL there is read as "charge the full fee for
-- every extra applicant" — `clearanceCatalogue.ts` line 205 — which is the safe
-- reading of a missing rate, but it is not what CLS charges.
--
-- The names are load-bearing. `src/lib/clearanceCatalogue.ts` in the frontend
-- matches them to the website's four clearance pages to attach the information
-- panel and the issuing country, so a renamed row shows without its panel.
-- ---------------------------------------------------------------------------
DELETE FROM `tbl_police_clearances`;

INSERT INTO `tbl_police_clearances`
  (`id`, `name`, `price`, `name_additional`, `price_additional`, `status`)
VALUES
  --                                        price   name_additional  price_additional
  (1, 'Australian Police Clearance',        180,    NULL,            140, 1),
  (2, 'New Zealand Police Clearance',       100,    NULL,             80, 1),
  (3, 'SAPS Clearance Certificate',         600,    NULL,            450, 1),
  (4, 'Saudi Police Clearance Certificate', 800,    NULL,            400, 1);

-- ---------------------------------------------------------------------------
-- tbl_russian_visa_voucher_types — the "Invitation type" and "Business type"
-- tables, in that order.
--
-- Two things about this table are not obvious from looking at it:
--
--   * `type` is 'invitation' for the tourist rows. That is what CLS's own
--     `ManageRussianVisaVoucherController` writes for the "Invitation type"
--     table; the word "Tourist" appears only in the description. The website
--     aliases it back to tourist.
--   * A fee of 0 means the turnaround is not offered, and the old price table
--     drew those cells as a dash. It is not a free voucher, and the website
--     drops the cell rather than pricing it at nothing.
--
-- Fees are ex GST, as the admin's "Cost $(Ex GST)" heading says. The website
-- adds the 10% as its own line.
-- ---------------------------------------------------------------------------
DELETE FROM `tbl_russian_visa_voucher_types`;

INSERT INTO `tbl_russian_visa_voucher_types`
  (`id`, `type`, `name`,
   `three_days_process_fee`, `one_two_days_process_fee`, `twelve_hrs_process_fee`,
   `thirteen_days`, `four_days`,
   `entry_option`, `s_active`, `type_order`)
VALUES
  -- Invitation type: three processing speeds, no 13/4 day columns.
  (1, 'invitation', 'Tourist single entry',
      85, 95, 113, 0, 0, 'Single Entry',   1, '1'),
  (2, 'invitation', 'Tourist double entry',
      85, 95, 113, 0, 0, 'Double Entry',   1, '2'),

  -- Business type: the 13 day and 4 day columns only, one filled in per row.
  (3, 'business', 'Business 1 month single entry',
      0, 0, 0,   0, 300, 'Single Entry',   1, '3'),
  (4, 'business', 'Business 1 month double entry',
      0, 0, 0,   0, 316, 'Double Entry',   1, '4'),
  (5, 'business', 'Business 3 months single entry',
      0, 0, 0,   0, 303, 'Single Entry',   1, '5'),
  (6, 'business', 'Business Multiple entry 6 months',
      0, 0, 0, 384,   0, 'Multiple Entry', 1, '6'),
  (7, 'business', 'Business Multiple entry 12 months',
      0, 0, 0, 400,   0, 'Multiple Entry', 1, '7'),
  (8, 'business', 'Business 3 months Double entry',
      0, 0, 0,   0, 316, 'Double Entry',   1, '8');

COMMIT;
