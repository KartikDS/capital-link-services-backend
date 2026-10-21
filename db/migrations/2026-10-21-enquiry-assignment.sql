-- Enquiry manager: "Assigned To". For CLS's DBA to apply. The app issues no DDL.
--
-- `tbl_inquiries` has no column for who is handling an enquiry. This adds one,
-- holding a `tbl_user_admin.id`. It is the only change to that table.
--
-- Additive and reversible (see the .undo.sql). Nullable with no default, so
-- every existing row reads as "unassigned" and no old code is affected.
-- The index serves the "assigned to" filter on the enquiry screen.
--
-- Until this is applied the app still works: the enquiry screen disables the
-- Assigned To control and says why, and Status (which needs no change) is live.

ALTER TABLE `tbl_inquiries`
  ADD COLUMN `assigned_to` int(11) NULL DEFAULT NULL AFTER `status`,
  ADD INDEX `idx_inquiries_assigned_to` (`assigned_to`);
