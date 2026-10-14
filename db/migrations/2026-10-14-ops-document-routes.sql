-- CLS Ops Phase 1: document routes, sign-off, pending items, departments.
--
-- ADDITIVE ONLY. Creates eight new tables, all prefixed `tbl_ops_`, and seeds two
-- of them. It does not ALTER, UPDATE, DELETE or reference-constrain any existing
-- table. The legacy admin reads the same database and will not notice any of it.
--
--   * No FOREIGN KEY constraints. Links to legacy tables (`order_id`, `doc_id`,
--     staff ids) are plain indexed INT(11) columns, the same type as the legacy
--     ids; the application enforces them. A foreign key into `tbl_cls_order`
--     would take metadata locks on the busiest table and block legacy deletes.
--   * Idempotent. Every statement is CREATE TABLE IF NOT EXISTS or INSERT IGNORE,
--     so running it twice changes nothing.
--   * Reversible with 2026-10-14-ops-document-routes.undo.sql (drops only the
--     tables created here).
--   * The app issues no DDL. Apply this file separately: `npm run ops:migrate`
--     locally, or hand it to CLS's DBA for the live database.
--
-- A "document" here is a row of `tbl_order_dl_checklist` (document legalisation).
-- Nothing in this file copies, rewrites or backfills existing orders: orders
-- already in flight simply show "route not planned" until someone plans one.

-- Embassies, chambers, notaries and government departments documents are sent to.
CREATE TABLE IF NOT EXISTS `tbl_ops_department` (
  `id`          INT(11)       NOT NULL AUTO_INCREMENT,
  `code`        VARCHAR(24)   NOT NULL,
  `name`        VARCHAR(200)  NOT NULL,
  `short_name`  VARCHAR(32)   NOT NULL,
  `type`        VARCHAR(16)   NOT NULL DEFAULT 'other',
  `email`       VARCHAR(190)  DEFAULT NULL,
  `phone`       VARCHAR(60)   DEFAULT NULL,
  `address`     VARCHAR(300)  DEFAULT NULL,
  `tat_days`    SMALLINT(6)   NOT NULL DEFAULT 1,
  `default_fee` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `is_active`   TINYINT(1)    NOT NULL DEFAULT 1,
  `created_at`  DATETIME      DEFAULT NULL,
  `updated_at`  DATETIME      DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ops_department_code` (`code`),
  KEY `idx_ops_department_type` (`type`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Verification of one document: the four checks and who signed them off.
CREATE TABLE IF NOT EXISTS `tbl_ops_doc_check` (
  `id`          INT(11)      NOT NULL AUTO_INCREMENT,
  `order_id`    INT(11)      NOT NULL,
  `doc_id`      INT(11)      NOT NULL,
  `status`      VARCHAR(10)  NOT NULL DEFAULT 'pending',
  `ticks`       TEXT         DEFAULT NULL,
  `verified_by` INT(11)      DEFAULT NULL,
  `verified_at` DATETIME     DEFAULT NULL,
  `created_at`  DATETIME     DEFAULT NULL,
  `updated_at`  DATETIME     DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ops_doc_check_doc` (`doc_id`),
  KEY `idx_ops_doc_check_order` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- One stop on a document's route. Signed twice: sent, then received.
CREATE TABLE IF NOT EXISTS `tbl_ops_doc_leg` (
  `id`                 INT(11)       NOT NULL AUTO_INCREMENT,
  `order_id`           INT(11)       NOT NULL,
  `doc_id`             INT(11)       NOT NULL,
  `seq`                SMALLINT(6)   NOT NULL DEFAULT 1,
  `department_id`      INT(11)       NOT NULL,
  `service_label`      VARCHAR(60)   DEFAULT NULL,
  `price`              DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `responsible_id`     INT(11)       DEFAULT NULL,
  `status`             VARCHAR(10)   NOT NULL DEFAULT 'todo',
  `sent_at`            DATETIME      DEFAULT NULL,
  `sent_by`            INT(11)       DEFAULT NULL,
  `sent_exception`     VARCHAR(500)  DEFAULT NULL,
  `sent_ref`           VARCHAR(120)  DEFAULT NULL,
  `received_at`        DATETIME      DEFAULT NULL,
  `received_by`        INT(11)       DEFAULT NULL,
  `received_exception` VARCHAR(500)  DEFAULT NULL,
  `created_at`         DATETIME      DEFAULT NULL,
  `updated_at`         DATETIME      DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ops_leg_doc` (`doc_id`, `seq`),
  KEY `idx_ops_leg_order` (`order_id`),
  KEY `idx_ops_leg_dept_status` (`department_id`, `status`),
  KEY `idx_ops_leg_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Append-only history behind every document's timeline and the undo button.
CREATE TABLE IF NOT EXISTS `tbl_ops_leg_event` (
  `id`         INT(11)      NOT NULL AUTO_INCREMENT,
  `order_id`   INT(11)      NOT NULL,
  `doc_id`     INT(11)      NOT NULL,
  `leg_id`     INT(11)      DEFAULT NULL,
  `kind`       VARCHAR(16)  NOT NULL,
  `admin_id`   INT(11)      DEFAULT NULL,
  `detail`     TEXT         DEFAULT NULL,
  `checks`     TEXT         DEFAULT NULL,
  `exception`  VARCHAR(500) DEFAULT NULL,
  `undone`     TINYINT(1)   NOT NULL DEFAULT 0,
  `created_at` DATETIME     DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ops_event_doc` (`doc_id`, `id`),
  KEY `idx_ops_event_order` (`order_id`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Something an order is waiting on, with a chase clock.
CREATE TABLE IF NOT EXISTS `tbl_ops_pending_item` (
  `id`               INT(11)      NOT NULL AUTO_INCREMENT,
  `order_id`         INT(11)      NOT NULL,
  `doc_id`           INT(11)      DEFAULT NULL,
  `text`             VARCHAR(500) NOT NULL,
  `owner`            VARCHAR(12)  NOT NULL DEFAULT 'client',
  `who`              VARCHAR(120) DEFAULT NULL,
  `raised_by`        INT(11)      DEFAULT NULL,
  `raised_at`        DATETIME     DEFAULT NULL,
  `due_at`           DATETIME     DEFAULT NULL,
  `reminders`        SMALLINT(6)  NOT NULL DEFAULT 0,
  `last_reminded_at` DATETIME     DEFAULT NULL,
  `resolved_at`      DATETIME     DEFAULT NULL,
  `resolved_by`      INT(11)      DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ops_pending_order` (`order_id`, `resolved_at`),
  KEY `idx_ops_pending_due` (`resolved_at`, `due_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Who claimed an order, and how it goes back to the client.
CREATE TABLE IF NOT EXISTS `tbl_ops_order_state` (
  `id`            INT(11)      NOT NULL AUTO_INCREMENT,
  `order_id`      INT(11)      NOT NULL,
  `claimed_by`    INT(11)      DEFAULT NULL,
  `claimed_at`    DATETIME     DEFAULT NULL,
  `return_method` VARCHAR(10)  DEFAULT NULL,
  `returned_by`   VARCHAR(120) DEFAULT NULL,
  `returned_at`   DATETIME     DEFAULT NULL,
  `created_at`    DATETIME     DEFAULT NULL,
  `updated_at`    DATETIME     DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ops_order_state_order` (`order_id`),
  KEY `idx_ops_order_state_claimed` (`claimed_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- The order's activity feed (the legacy `tbl_logs` is not keyed on an order).
CREATE TABLE IF NOT EXISTS `tbl_ops_activity` (
  `id`         INT(11)      NOT NULL AUTO_INCREMENT,
  `order_id`   INT(11)      NOT NULL,
  `kind`       VARCHAR(16)  NOT NULL DEFAULT 'note',
  `text`       VARCHAR(500) NOT NULL,
  `admin_id`   INT(11)      DEFAULT NULL,
  `created_at` DATETIME     DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ops_activity_order` (`order_id`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- SLA hours and other Ops settings, editable without a deploy.
CREATE TABLE IF NOT EXISTS `tbl_ops_setting` (
  `k` VARCHAR(40)  NOT NULL,
  `v` VARCHAR(200) NOT NULL,
  PRIMARY KEY (`k`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Seeds. INSERT IGNORE: a re-run, or a row CLS has already edited, is left alone.
-- Fees are 0.00 on purpose: CLS sets the real figures per department in the
-- admin (User manager > Embassies & departments). Nothing is invented here.
-- Route templates: how a suggested route is built for a destination and a kind of
-- document. Edited from Routes, SLA & automation; the standard ones are seeded
-- below and are ordinary rows (edit, switch off or delete them). With no matching
-- template an order simply gets no suggested route and staff add the legs by hand.
--   destination : a country name, or NULL for any
--   dest_group  : any | hague | non_hague | arab  (the country lists below)
--   doc_kind    : any | commercial | personal | civil | police
CREATE TABLE IF NOT EXISTS `tbl_ops_route_template` (
  `id`          INT(11)      NOT NULL AUTO_INCREMENT,
  `destination` VARCHAR(100) DEFAULT NULL,
  `dest_group`  VARCHAR(12)  NOT NULL DEFAULT 'any',
  `doc_kind`    VARCHAR(12)  NOT NULL DEFAULT 'any',
  `doc_label`   VARCHAR(150) DEFAULT NULL,
  `pathway`     VARCHAR(12)  NOT NULL DEFAULT 'embassy',
  `usual_days`  SMALLINT(6)  NOT NULL DEFAULT 1,
  `is_active`   TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`  DATETIME     DEFAULT NULL,
  `updated_at`  DATETIME     DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ops_route_template_dest` (`destination`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- The ordered stops of one template: a fixed department, or (department_id NULL)
-- a department type resolved when the route is applied ('embassy' = the embassy of
-- the order's destination).
CREATE TABLE IF NOT EXISTS `tbl_ops_route_template_leg` (
  `id`            INT(11)     NOT NULL AUTO_INCREMENT,
  `template_id`   INT(11)     NOT NULL,
  `seq`           SMALLINT(6) NOT NULL DEFAULT 1,
  `department_id` INT(11)     DEFAULT NULL,
  `dept_type`     VARCHAR(24) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ops_route_template_leg_tpl` (`template_id`, `seq`),
  KEY `idx_ops_route_template_leg_dept` (`department_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- What a consultant ticks on every document before it is routed.
CREATE TABLE IF NOT EXISTS `tbl_ops_check_def` (
  `id`         INT(11)      NOT NULL AUTO_INCREMENT,
  `code`       VARCHAR(40)  NOT NULL,
  `label`      VARCHAR(200) NOT NULL,
  `sort_order` SMALLINT(6)  NOT NULL DEFAULT 0,
  `is_active`  TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ops_check_def_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Kinds of department (notary, embassy, ...). A department's `type` holds one code.
CREATE TABLE IF NOT EXISTS `tbl_ops_dept_type` (
  `id`         INT(11)      NOT NULL AUTO_INCREMENT,
  `code`       VARCHAR(24)  NOT NULL,
  `label`      VARCHAR(120) NOT NULL,
  `sort_order` SMALLINT(6)  NOT NULL DEFAULT 0,
  `is_active`  TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ops_dept_type_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- The checks signed when a document leaves CLS (send) or comes back (receive).
CREATE TABLE IF NOT EXISTS `tbl_ops_leg_rule` (
  `id`         INT(11)      NOT NULL AUTO_INCREMENT,
  `type_code`  VARCHAR(24)  NOT NULL,
  `phase`      VARCHAR(8)   NOT NULL,
  `label`      VARCHAR(300) NOT NULL,
  `sort_order` SMALLINT(6)  NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_ops_leg_rule_type` (`type_code`, `phase`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Plain lists the routing rules read: hague and arab (country names),
-- civil_doc and police_doc (words in a document's name).
CREATE TABLE IF NOT EXISTS `tbl_ops_list_item` (
  `id`         INT(11)      NOT NULL AUTO_INCREMENT,
  `list_key`   VARCHAR(24)  NOT NULL,
  `value`      VARCHAR(150) NOT NULL,
  `sort_order` SMALLINT(6)  NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_ops_list_item_key` (`list_key`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO `tbl_ops_department`
  (`code`, `name`, `short_name`, `type`, `tat_days`, `default_fee`, `is_active`, `created_at`, `updated_at`) VALUES
  ('NOTARY', 'Notary Public',                                           'Notary', 'notary',      1, 0.00, 1, NOW(), NOW()),
  ('TRANS',  'NAATI-certified translator',                              'Translator', 'translation', 2, 0.00, 1, NOW(), NOW()),
  ('AACCI',  'Australia Arab Chamber of Commerce & Industry',           'AACCI',  'chamber',     1, 0.00, 1, NOW(), NOW()),
  ('ACCI',   'Chamber of Commerce (certificate of origin)',             'Chamber', 'chamber',    1, 0.00, 1, NOW(), NOW()),
  ('DFAT',   'DFAT Authentication & Legalisation',                      'DFAT',   'govt',        1, 0.00, 1, NOW(), NOW()),
  ('AFP',    'Australian Federal Police - National Police Check',       'AFP',    'police',      5, 0.00, 1, NOW(), NOW());

INSERT IGNORE INTO `tbl_ops_setting` (`k`, `v`) VALUES
  ('sla_claim_h',  '1.5'),
  ('sla_verify_h', '24'),
  ('sla_chase_h',  '48'),
  ('sla_route_h',  '4'),
  ('sla_ready_h',  '24');

-- Standard defaults for the rule tables above. Seeded ONCE (guarded by the flag
-- row at the end), so deleting or editing a default is never undone by re-running
-- this file. Everything here is edited from Routes, SLA & automation.

INSERT IGNORE INTO `tbl_ops_check_def` (`code`, `label`, `sort_order`, `is_active`)
SELECT s.`code`, s.`label`, s.`sort_order`, s.`is_active` FROM (
  SELECT 'orig' AS `code`, 'Original or certified copy' AS `label`, 1 AS `sort_order`, 1 AS `is_active`
  UNION ALL SELECT 'sign', 'Signed and sealed by the issuer', 2, 1
  UNION ALL SELECT 'req', 'Meets destination requirements', 3, 1
  UNION ALL SELECT 'scan', 'Readable scan on file', 4, 1
) s
WHERE NOT EXISTS (SELECT 1 FROM `tbl_ops_setting` WHERE `k` = 'seed_config_v1');

INSERT IGNORE INTO `tbl_ops_dept_type` (`code`, `label`, `sort_order`, `is_active`)
SELECT s.`code`, s.`label`, s.`sort_order`, s.`is_active` FROM (
  SELECT 'notary' AS `code`, 'Notary' AS `label`, 1 AS `sort_order`, 1 AS `is_active`
  UNION ALL SELECT 'chamber', 'Chamber of commerce', 2, 1
  UNION ALL SELECT 'govt', 'Government (DFAT)', 3, 1
  UNION ALL SELECT 'embassy', 'Embassy / consulate', 4, 1
  UNION ALL SELECT 'police', 'Police', 5, 1
  UNION ALL SELECT 'translation', 'Translator', 6, 1
  UNION ALL SELECT 'other', 'Other', 7, 1
) s
WHERE NOT EXISTS (SELECT 1 FROM `tbl_ops_setting` WHERE `k` = 'seed_config_v1');

INSERT IGNORE INTO `tbl_ops_leg_rule` (`type_code`, `phase`, `label`, `sort_order`)
SELECT s.`type_code`, s.`phase`, s.`label`, s.`sort_order` FROM (
  SELECT 'notary' AS `type_code`, 'send' AS `phase`, 'Original sighted and a copy kept on file' AS `label`, 1 AS `sort_order`
  UNION ALL SELECT 'notary', 'send', 'Client ID copy attached (personal documents)', 2
  UNION ALL SELECT 'notary', 'send', 'Notary fee recorded on the order', 3
  UNION ALL SELECT 'notary', 'send', 'Document listed on the notary cover sheet', 4
  UNION ALL SELECT 'notary', 'receive', 'Notary seal and signature on every page', 1
  UNION ALL SELECT 'notary', 'receive', 'Notary name and registration legible', 2
  UNION ALL SELECT 'notary', 'receive', 'Name matches the passport / order', 3
  UNION ALL SELECT 'notary', 'receive', 'Scan of the notarised document saved to the order', 4
  UNION ALL SELECT 'chamber', 'send', 'Certificate of origin matches the commercial invoice', 1
  UNION ALL SELECT 'chamber', 'send', 'Exporter details and HS codes checked', 2
  UNION ALL SELECT 'chamber', 'send', 'Chamber application submitted online', 3
  UNION ALL SELECT 'chamber', 'send', 'Chamber fee paid or on account', 4
  UNION ALL SELECT 'chamber', 'receive', 'Chamber stamp and signature present', 1
  UNION ALL SELECT 'chamber', 'receive', 'Certificate number recorded', 2
  UNION ALL SELECT 'chamber', 'receive', 'All pages returned, nothing detached', 3
  UNION ALL SELECT 'chamber', 'receive', 'Scan saved to the order', 4
  UNION ALL SELECT 'govt', 'send', 'Signature or seal is one DFAT can verify (notary or issuing authority)', 1
  UNION ALL SELECT 'govt', 'send', 'Correct service chosen: apostille or authentication', 2
  UNION ALL SELECT 'govt', 'send', 'DFAT lodgement form completed', 3
  UNION ALL SELECT 'govt', 'send', 'Copy scanned before lodgement', 4
  UNION ALL SELECT 'govt', 'receive', 'Apostille / authentication certificate attached', 1
  UNION ALL SELECT 'govt', 'receive', 'Certificate number recorded', 2
  UNION ALL SELECT 'govt', 'receive', 'Correct document and page count returned', 3
  UNION ALL SELECT 'govt', 'receive', 'Scan saved to the order', 4
  UNION ALL SELECT 'embassy', 'send', 'DFAT authentication present (not an apostille)', 1
  UNION ALL SELECT 'embassy', 'send', 'Embassy application form and cover letter enclosed', 2
  UNION ALL SELECT 'embassy', 'send', 'Embassy fee prepared (bank cheque / transfer reference)', 3
  UNION ALL SELECT 'embassy', 'send', 'Passport copy enclosed where the embassy asks for it', 4
  UNION ALL SELECT 'embassy', 'receive', 'Embassy stamp or sticker on every document', 1
  UNION ALL SELECT 'embassy', 'receive', 'Fee receipt kept with the order', 2
  UNION ALL SELECT 'embassy', 'receive', 'Correct number of documents returned', 3
  UNION ALL SELECT 'embassy', 'receive', 'Scan saved to the order', 4
  UNION ALL SELECT 'police', 'send', 'Consent form signed and ID verified', 1
  UNION ALL SELECT 'police', 'send', 'Purpose and destination country set correctly', 2
  UNION ALL SELECT 'police', 'send', 'Fee paid', 3
  UNION ALL SELECT 'police', 'receive', 'Certificate received and checked', 1
  UNION ALL SELECT 'police', 'receive', 'Name and date of birth match the passport', 2
  UNION ALL SELECT 'police', 'receive', 'Scan saved to the order', 3
  UNION ALL SELECT 'translation', 'send', 'Clear copy sent to the translator', 1
  UNION ALL SELECT 'translation', 'send', 'Target language confirmed', 2
  UNION ALL SELECT 'translation', 'send', 'Name spelling confirmed with the client', 3
  UNION ALL SELECT 'translation', 'receive', 'NAATI stamp and translator number present', 1
  UNION ALL SELECT 'translation', 'receive', 'Names and dates match the source document', 2
  UNION ALL SELECT 'translation', 'receive', 'Scan saved to the order', 3
  UNION ALL SELECT 'other', 'send', 'Document checked and copied before sending', 1
  UNION ALL SELECT 'other', 'send', 'Fee recorded', 2
  UNION ALL SELECT 'other', 'receive', 'Correct document returned', 1
  UNION ALL SELECT 'other', 'receive', 'Scan saved to the order', 2
) s
WHERE NOT EXISTS (SELECT 1 FROM `tbl_ops_setting` WHERE `k` = 'seed_config_v1');

INSERT IGNORE INTO `tbl_ops_list_item` (`list_key`, `value`, `sort_order`)
SELECT s.`list_key`, s.`value`, s.`sort_order` FROM (
  SELECT 'hague' AS `list_key`, 'Albania' AS `value`, 1 AS `sort_order`
  UNION ALL SELECT 'hague', 'Andorra', 2
  UNION ALL SELECT 'hague', 'Argentina', 3
  UNION ALL SELECT 'hague', 'Armenia', 4
  UNION ALL SELECT 'hague', 'Austria', 5
  UNION ALL SELECT 'hague', 'Azerbaijan', 6
  UNION ALL SELECT 'hague', 'Bahamas', 7
  UNION ALL SELECT 'hague', 'Bahrain', 8
  UNION ALL SELECT 'hague', 'Barbados', 9
  UNION ALL SELECT 'hague', 'Belarus', 10
  UNION ALL SELECT 'hague', 'Belgium', 11
  UNION ALL SELECT 'hague', 'Belize', 12
  UNION ALL SELECT 'hague', 'Bolivia', 13
  UNION ALL SELECT 'hague', 'Bosnia and Herzegovina', 14
  UNION ALL SELECT 'hague', 'Botswana', 15
  UNION ALL SELECT 'hague', 'Brazil', 16
  UNION ALL SELECT 'hague', 'Brunei', 17
  UNION ALL SELECT 'hague', 'Bulgaria', 18
  UNION ALL SELECT 'hague', 'Canada', 19
  UNION ALL SELECT 'hague', 'Chile', 20
  UNION ALL SELECT 'hague', 'China', 21
  UNION ALL SELECT 'hague', 'Colombia', 22
  UNION ALL SELECT 'hague', 'Costa Rica', 23
  UNION ALL SELECT 'hague', 'Croatia', 24
  UNION ALL SELECT 'hague', 'Cyprus', 25
  UNION ALL SELECT 'hague', 'Czech Republic', 26
  UNION ALL SELECT 'hague', 'Denmark', 27
  UNION ALL SELECT 'hague', 'Dominican Republic', 28
  UNION ALL SELECT 'hague', 'Ecuador', 29
  UNION ALL SELECT 'hague', 'El Salvador', 30
  UNION ALL SELECT 'hague', 'Estonia', 31
  UNION ALL SELECT 'hague', 'Fiji', 32
  UNION ALL SELECT 'hague', 'Finland', 33
  UNION ALL SELECT 'hague', 'France', 34
  UNION ALL SELECT 'hague', 'Georgia', 35
  UNION ALL SELECT 'hague', 'Germany', 36
  UNION ALL SELECT 'hague', 'Greece', 37
  UNION ALL SELECT 'hague', 'Guatemala', 38
  UNION ALL SELECT 'hague', 'Honduras', 39
  UNION ALL SELECT 'hague', 'Hong Kong', 40
  UNION ALL SELECT 'hague', 'Hungary', 41
  UNION ALL SELECT 'hague', 'Iceland', 42
  UNION ALL SELECT 'hague', 'India', 43
  UNION ALL SELECT 'hague', 'Ireland', 44
  UNION ALL SELECT 'hague', 'Israel', 45
  UNION ALL SELECT 'hague', 'Italy', 46
  UNION ALL SELECT 'hague', 'Jamaica', 47
  UNION ALL SELECT 'hague', 'Japan', 48
  UNION ALL SELECT 'hague', 'Kazakhstan', 49
  UNION ALL SELECT 'hague', 'Kyrgyzstan', 50
  UNION ALL SELECT 'hague', 'Latvia', 51
  UNION ALL SELECT 'hague', 'Lithuania', 52
  UNION ALL SELECT 'hague', 'Luxembourg', 53
  UNION ALL SELECT 'hague', 'Macau', 54
  UNION ALL SELECT 'hague', 'Malta', 55
  UNION ALL SELECT 'hague', 'Mauritius', 56
  UNION ALL SELECT 'hague', 'Mexico', 57
  UNION ALL SELECT 'hague', 'Moldova', 58
  UNION ALL SELECT 'hague', 'Monaco', 59
  UNION ALL SELECT 'hague', 'Mongolia', 60
  UNION ALL SELECT 'hague', 'Montenegro', 61
  UNION ALL SELECT 'hague', 'Morocco', 62
  UNION ALL SELECT 'hague', 'Namibia', 63
  UNION ALL SELECT 'hague', 'Netherlands', 64
  UNION ALL SELECT 'hague', 'New Zealand', 65
  UNION ALL SELECT 'hague', 'Nicaragua', 66
  UNION ALL SELECT 'hague', 'North Macedonia', 67
  UNION ALL SELECT 'hague', 'Norway', 68
  UNION ALL SELECT 'hague', 'Oman', 69
  UNION ALL SELECT 'hague', 'Pakistan', 70
  UNION ALL SELECT 'hague', 'Panama', 71
  UNION ALL SELECT 'hague', 'Paraguay', 72
  UNION ALL SELECT 'hague', 'Peru', 73
  UNION ALL SELECT 'hague', 'Philippines', 74
  UNION ALL SELECT 'hague', 'Poland', 75
  UNION ALL SELECT 'hague', 'Portugal', 76
  UNION ALL SELECT 'hague', 'Romania', 77
  UNION ALL SELECT 'hague', 'Russia', 78
  UNION ALL SELECT 'hague', 'Samoa', 79
  UNION ALL SELECT 'hague', 'San Marino', 80
  UNION ALL SELECT 'hague', 'Saudi Arabia', 81
  UNION ALL SELECT 'hague', 'Serbia', 82
  UNION ALL SELECT 'hague', 'Seychelles', 83
  UNION ALL SELECT 'hague', 'Singapore', 84
  UNION ALL SELECT 'hague', 'Slovakia', 85
  UNION ALL SELECT 'hague', 'Slovenia', 86
  UNION ALL SELECT 'hague', 'South Africa', 87
  UNION ALL SELECT 'hague', 'South Korea', 88
  UNION ALL SELECT 'hague', 'Spain', 89
  UNION ALL SELECT 'hague', 'Sweden', 90
  UNION ALL SELECT 'hague', 'Switzerland', 91
  UNION ALL SELECT 'hague', 'Tajikistan', 92
  UNION ALL SELECT 'hague', 'Tonga', 93
  UNION ALL SELECT 'hague', 'Trinidad and Tobago', 94
  UNION ALL SELECT 'hague', 'Tunisia', 95
  UNION ALL SELECT 'hague', 'Turkey', 96
  UNION ALL SELECT 'hague', 'Ukraine', 97
  UNION ALL SELECT 'hague', 'United Arab Emirates', 98
  UNION ALL SELECT 'hague', 'United Kingdom', 99
  UNION ALL SELECT 'hague', 'United States', 100
  UNION ALL SELECT 'hague', 'Uruguay', 101
  UNION ALL SELECT 'hague', 'Uzbekistan', 102
  UNION ALL SELECT 'hague', 'Vanuatu', 103
  UNION ALL SELECT 'hague', 'Venezuela', 104
  UNION ALL SELECT 'arab', 'Algeria', 1
  UNION ALL SELECT 'arab', 'Bahrain', 2
  UNION ALL SELECT 'arab', 'Comoros', 3
  UNION ALL SELECT 'arab', 'Djibouti', 4
  UNION ALL SELECT 'arab', 'Egypt', 5
  UNION ALL SELECT 'arab', 'Iraq', 6
  UNION ALL SELECT 'arab', 'Jordan', 7
  UNION ALL SELECT 'arab', 'Kuwait', 8
  UNION ALL SELECT 'arab', 'Lebanon', 9
  UNION ALL SELECT 'arab', 'Libya', 10
  UNION ALL SELECT 'arab', 'Mauritania', 11
  UNION ALL SELECT 'arab', 'Morocco', 12
  UNION ALL SELECT 'arab', 'Oman', 13
  UNION ALL SELECT 'arab', 'Palestine', 14
  UNION ALL SELECT 'arab', 'Qatar', 15
  UNION ALL SELECT 'arab', 'Saudi Arabia', 16
  UNION ALL SELECT 'arab', 'Somalia', 17
  UNION ALL SELECT 'arab', 'Sudan', 18
  UNION ALL SELECT 'arab', 'Syria', 19
  UNION ALL SELECT 'arab', 'Tunisia', 20
  UNION ALL SELECT 'arab', 'United Arab Emirates', 21
  UNION ALL SELECT 'arab', 'Yemen', 22
  UNION ALL SELECT 'civil_doc', 'Birth', 1
  UNION ALL SELECT 'civil_doc', 'Marriage', 2
  UNION ALL SELECT 'civil_doc', 'Death', 3
  UNION ALL SELECT 'civil_doc', 'Divorce', 4
  UNION ALL SELECT 'civil_doc', 'Change of Name', 5
  UNION ALL SELECT 'police_doc', 'Police', 1
) s
WHERE NOT EXISTS (SELECT 1 FROM `tbl_ops_setting` WHERE `k` = 'seed_config_v1');

INSERT IGNORE INTO `tbl_ops_route_template` (`id`, `destination`, `dest_group`, `doc_kind`, `doc_label`, `pathway`, `usual_days`, `is_active`, `created_at`, `updated_at`)
SELECT s.`id`, s.`destination`, s.`dest_group`, s.`doc_kind`, s.`doc_label`, s.`pathway`, s.`usual_days`, s.`is_active`, s.`created_at`, s.`updated_at` FROM (
  SELECT 101 AS `id`, NULL AS `destination`, 'arab' AS `dest_group`, 'commercial' AS `doc_kind`, NULL AS `doc_label`, 'embassy' AS `pathway`, 5 AS `usual_days`, 1 AS `is_active`, NOW() AS `created_at`, NOW() AS `updated_at`
  UNION ALL SELECT 102, NULL, 'hague', 'commercial', NULL, 'apostille', 2, 1, NOW(), NOW()
  UNION ALL SELECT 103, NULL, 'non_hague', 'commercial', NULL, 'embassy', 5, 1, NOW(), NOW()
  UNION ALL SELECT 104, NULL, 'hague', 'police', NULL, 'apostille', 6, 1, NOW(), NOW()
  UNION ALL SELECT 105, NULL, 'non_hague', 'police', NULL, 'embassy', 8, 1, NOW(), NOW()
  UNION ALL SELECT 106, NULL, 'hague', 'civil', NULL, 'apostille', 1, 1, NOW(), NOW()
  UNION ALL SELECT 107, NULL, 'non_hague', 'civil', NULL, 'embassy', 3, 1, NOW(), NOW()
  UNION ALL SELECT 108, NULL, 'hague', 'personal', NULL, 'apostille', 2, 1, NOW(), NOW()
  UNION ALL SELECT 109, NULL, 'non_hague', 'personal', NULL, 'embassy', 5, 1, NOW(), NOW()
) s
WHERE NOT EXISTS (SELECT 1 FROM `tbl_ops_setting` WHERE `k` = 'seed_config_v1');

INSERT IGNORE INTO `tbl_ops_route_template_leg` (`id`, `template_id`, `seq`, `department_id`, `dept_type`)
SELECT s.`id`, s.`template_id`, s.`seq`, s.`department_id`, s.`dept_type` FROM (
  SELECT 1001 AS `id`, 101 AS `template_id`, 1 AS `seq`, (SELECT `id` FROM `tbl_ops_department` WHERE `code` = 'AACCI' LIMIT 1) AS `department_id`, NULL AS `dept_type`
  UNION ALL SELECT 1002, 101, 2, (SELECT `id` FROM `tbl_ops_department` WHERE `code` = 'DFAT' LIMIT 1), NULL
  UNION ALL SELECT 1003, 101, 3, NULL, 'embassy'
  UNION ALL SELECT 1004, 102, 1, (SELECT `id` FROM `tbl_ops_department` WHERE `code` = 'ACCI' LIMIT 1), NULL
  UNION ALL SELECT 1005, 102, 2, (SELECT `id` FROM `tbl_ops_department` WHERE `code` = 'DFAT' LIMIT 1), NULL
  UNION ALL SELECT 1006, 103, 1, (SELECT `id` FROM `tbl_ops_department` WHERE `code` = 'ACCI' LIMIT 1), NULL
  UNION ALL SELECT 1007, 103, 2, (SELECT `id` FROM `tbl_ops_department` WHERE `code` = 'DFAT' LIMIT 1), NULL
  UNION ALL SELECT 1008, 103, 3, NULL, 'embassy'
  UNION ALL SELECT 1009, 104, 1, (SELECT `id` FROM `tbl_ops_department` WHERE `code` = 'AFP' LIMIT 1), NULL
  UNION ALL SELECT 1010, 104, 2, (SELECT `id` FROM `tbl_ops_department` WHERE `code` = 'DFAT' LIMIT 1), NULL
  UNION ALL SELECT 1011, 105, 1, (SELECT `id` FROM `tbl_ops_department` WHERE `code` = 'AFP' LIMIT 1), NULL
  UNION ALL SELECT 1012, 105, 2, (SELECT `id` FROM `tbl_ops_department` WHERE `code` = 'DFAT' LIMIT 1), NULL
  UNION ALL SELECT 1013, 105, 3, NULL, 'embassy'
  UNION ALL SELECT 1014, 106, 1, (SELECT `id` FROM `tbl_ops_department` WHERE `code` = 'DFAT' LIMIT 1), NULL
  UNION ALL SELECT 1015, 107, 1, (SELECT `id` FROM `tbl_ops_department` WHERE `code` = 'DFAT' LIMIT 1), NULL
  UNION ALL SELECT 1016, 107, 2, NULL, 'embassy'
  UNION ALL SELECT 1017, 108, 1, (SELECT `id` FROM `tbl_ops_department` WHERE `code` = 'NOTARY' LIMIT 1), NULL
  UNION ALL SELECT 1018, 108, 2, (SELECT `id` FROM `tbl_ops_department` WHERE `code` = 'DFAT' LIMIT 1), NULL
  UNION ALL SELECT 1019, 109, 1, (SELECT `id` FROM `tbl_ops_department` WHERE `code` = 'NOTARY' LIMIT 1), NULL
  UNION ALL SELECT 1020, 109, 2, (SELECT `id` FROM `tbl_ops_department` WHERE `code` = 'DFAT' LIMIT 1), NULL
  UNION ALL SELECT 1021, 109, 3, NULL, 'embassy'
) s
WHERE NOT EXISTS (SELECT 1 FROM `tbl_ops_setting` WHERE `k` = 'seed_config_v1');

INSERT IGNORE INTO `tbl_ops_setting` (`k`, `v`) VALUES ('seed_config_v1', '1');
