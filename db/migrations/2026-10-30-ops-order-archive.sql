-- CLS Ops: archived orders.
--
-- One new table, tbl_ops_order_archive. It does not ALTER, UPDATE or DELETE any
-- existing table: archiving an order writes a row HERE, and every screen that lists
-- orders leaves out the ones named in it. Idempotent: CREATE TABLE IF NOT EXISTS.
-- Undo: 2026-10-30-ops-order-archive.undo.sql.
--
-- `is_archived` is the show/hide switch: 1 hides the order from the order lists, the
-- Document Hub, the payments list and the dashboard counts; 0 shows it again. A row
-- is kept (not deleted) when an order is restored, so who archived it, when and why
-- — and who restored it — stays on record.

CREATE TABLE IF NOT EXISTS `tbl_ops_order_archive` (
  `order_id`           INT(11)      NOT NULL,
  `is_archived`        TINYINT(1)   NOT NULL DEFAULT 1,
  `archived_at`        DATETIME     DEFAULT NULL,
  `archived_by`        INT(11)      DEFAULT NULL,
  `archived_by_name`   VARCHAR(255) DEFAULT NULL,
  `archive_note`       VARCHAR(500) DEFAULT NULL,
  `unarchived_at`      DATETIME     DEFAULT NULL,
  `unarchived_by`      INT(11)      DEFAULT NULL,
  `unarchived_by_name` VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (`order_id`),
  KEY `idx_ops_order_archive_flag` (`is_archived`, `archived_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
