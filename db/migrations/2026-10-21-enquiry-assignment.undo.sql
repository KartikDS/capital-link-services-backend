-- Removes what 2026-10-21-enquiry-assignment.sql added. Assignments are lost.
ALTER TABLE `tbl_inquiries`
  DROP INDEX `idx_inquiries_assigned_to`,
  DROP COLUMN `assigned_to`;
