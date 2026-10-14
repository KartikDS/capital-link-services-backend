-- Undo for 2026-10-14-ops-document-routes.sql.
--
-- Drops ONLY the fourteen tables that migration created. No legacy table is named
-- here. This discards whatever Ops data has been entered in them, so take a
-- backup first if the screens have been used.

DROP TABLE IF EXISTS `tbl_ops_list_item`;
DROP TABLE IF EXISTS `tbl_ops_leg_rule`;
DROP TABLE IF EXISTS `tbl_ops_dept_type`;
DROP TABLE IF EXISTS `tbl_ops_check_def`;
DROP TABLE IF EXISTS `tbl_ops_route_template_leg`;
DROP TABLE IF EXISTS `tbl_ops_route_template`;
DROP TABLE IF EXISTS `tbl_ops_setting`;
DROP TABLE IF EXISTS `tbl_ops_activity`;
DROP TABLE IF EXISTS `tbl_ops_order_state`;
DROP TABLE IF EXISTS `tbl_ops_pending_item`;
DROP TABLE IF EXISTS `tbl_ops_leg_event`;
DROP TABLE IF EXISTS `tbl_ops_doc_leg`;
DROP TABLE IF EXISTS `tbl_ops_doc_check`;
DROP TABLE IF EXISTS `tbl_ops_department`;
