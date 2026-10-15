-- CLS Ops: documents that need no legalisation.
--
-- One new table, tbl_ops_doc_skip. It does not ALTER, UPDATE or DELETE any existing
-- table. Idempotent: CREATE TABLE IF NOT EXISTS. Apply after
-- 2026-10-14-ops-document-routes.sql. Undo: 2026-10-15-ops-doc-skip.undo.sql.

-- A document staff decided does not need legalising: it takes no route and does
-- not hold the order back from being returned.
CREATE TABLE IF NOT EXISTS `tbl_ops_doc_skip` (
  `id`         INT(11)  NOT NULL AUTO_INCREMENT,
  `order_id`   INT(11)  NOT NULL,
  `doc_id`     INT(11)  NOT NULL,
  `skipped_by` INT(11)  DEFAULT NULL,
  `skipped_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ops_doc_skip_doc` (`doc_id`),
  KEY `idx_ops_doc_skip_order` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
