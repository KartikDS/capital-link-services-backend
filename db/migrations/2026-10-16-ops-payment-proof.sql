-- CLS Ops: proof for a payment staff record by hand.
--
-- One new table, tbl_ops_payment_proof. It does not ALTER, UPDATE or DELETE any
-- existing table. Idempotent: CREATE TABLE IF NOT EXISTS. Apply after
-- 2026-10-15-ops-doc-skip.sql. Undo: 2026-10-16-ops-payment-proof.undo.sql.

-- How a payment staff marked as paid was actually made, and the screenshot or
-- receipt that shows it. The money itself is still the tbl_payment row.
CREATE TABLE IF NOT EXISTS `tbl_ops_payment_proof` (
  `id`          INT(11)       NOT NULL AUTO_INCREMENT,
  `order_id`    INT(11)       NOT NULL,
  `payment_id`  INT(11)       DEFAULT NULL,
  `method`      VARCHAR(30)   NOT NULL,
  `reference`   VARCHAR(120)  DEFAULT NULL,
  `amount`      DECIMAL(10,2) DEFAULT NULL,
  `paid_on`     DATE          DEFAULT NULL,
  `note`        VARCHAR(500)  DEFAULT NULL,
  `file`        VARCHAR(255)  DEFAULT NULL,
  `file_name`   VARCHAR(255)  DEFAULT NULL,
  `recorded_by` INT(11)       DEFAULT NULL,
  `recorded_at` DATETIME      DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ops_payment_proof_order` (`order_id`),
  KEY `idx_ops_payment_proof_payment` (`payment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
