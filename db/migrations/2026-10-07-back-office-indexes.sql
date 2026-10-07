-- Back-office speed: indexes for CLS's DBA to apply. The app issues no DDL.
--
-- None of these columns is indexed today, so every queue total, dashboard count
-- and child-table lookup is a full table scan. On the dev copy a bare
-- `SELECT COUNT(*) FROM tbl_cls_order WHERE order_type = 9` takes ~4.5s and the
-- same count joined to the three legalisation child tables ~14s.
--
-- Additive and reversible (DROP INDEX). The app works without them — it caches
-- totals and loads child rows per page — they just make the cold path fast.
-- Run in a quiet window on a large table; ADD INDEX on InnoDB is online.

ALTER TABLE `tbl_cls_order`
  ADD INDEX `idx_order_type_id` (`order_type`, `id`),
  ADD INDEX `idx_status` (`status`),
  ADD INDEX `idx_payment_status` (`payment_status`);

ALTER TABLE `tbl_document_legalization_order_details` ADD INDEX `idx_order_id` (`order_id`);
ALTER TABLE `tbl_order_return_document_details`       ADD INDEX `idx_order_id` (`order_id`);
ALTER TABLE `tbl_order_doc_delivery_details`          ADD INDEX `idx_order_id` (`order_id`);
ALTER TABLE `tbl_order_traveller_details`             ADD INDEX `idx_order_id_primary` (`order_id`, `is_primary`);
ALTER TABLE `tbl_cls_order_documents`                 ADD INDEX `idx_status` (`status`);
