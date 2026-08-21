/**
 * `tbl_orders` — InnoDB, latin1.
 *
 * Generated from db/schema/clspubli_staging.sql by scripts/generateModels.ts.
 * Do not edit: re-run `npm run models:generate` if CLS supplies a new dump.
 */
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../../config/database';

/** Every column, as it is read back. Use this in presenters. */
export interface OrdersAttributes {
  order_no: number;
  client_id: number | null;
  date_last_saved: string | null;
  date_submitted: string | null;
  /** 1=visa; 2=tpn; 3=tpn+visa; 4=passport delivery; 5=police clearance; 6=public visa; 7=document delivery; 8=russian visa voucher; 9=DL */
  order_type: number | null;
  primary_traveller_name: string | null;
  primary_traveller_passport_no: string | null;
  /** country_id */
  destination: number | null;
  departure_date: string | null;
  pri_dept_contact_department_id: number | null;
  pri_dept_contact_fname: string | null;
  pri_dept_contact_lname: string | null;
  pri_dept_contact_email: string | null;
  pri_dept_contact_phone: string | null;
  tpn_qty: number | null;
  tpn_price: number | null;
  tpn_additional_qty: number | null;
  tpn_additional_price: number | null;
  visa_courier: number | null;
  visa_courier_price: number | null;
  visa_courier_pickup_date: string | null;
  visa_courier_pickup_ready_by_time_hr: string | null;
  visa_courier_pickup_ready_by_time_min: string | null;
  visa_courier_pickup_close_time_hr: string | null;
  visa_courier_pickup_close_time_min: string | null;
  visa_courier_pickup_contact_person_name: string | null;
  visa_courier_pickup_contact_person_phone: string | null;
  visa_courier_pickup_package_location: string | null;
  visa_mdd_company: string | null;
  visa_mdd_address: string | null;
  visa_mdd_city: string | null;
  visa_mdd_state: string | null;
  visa_mdd_postcode: string | null;
  visa_mdd_fname: string | null;
  visa_mdd_lname: string | null;
  visa_mdd_contact: string | null;
  visa_additional_comment: string | null;
  visa_cls_team_member: number | null;
  visa_is_delivered_to_embassy: number | null;
  visa_is_delivered_to_embassy_date: string | null;
  visa_next_embassy: string | null;
  passport_office_booking_no: string | null;
  passport_office_booking_time: string | null;
  passport_office_booking_time_hr: string | null;
  passport_office_booking_time_min: string | null;
  police_clearance_id: number | null;
  police_clearance_date_cls_received_all_items: string | null;
  police_clearance_date_submitted_for_processing: string | null;
  police_clearance_date_completed_and_received_at_cls: string | null;
  police_clearance_date_order_on_route_and_closed: string | null;
  doc_delivery_type: number | null;
  doc_receiver_name: string | null;
  doc_pickup_address: string | null;
  doc_pickup_city: string | null;
  doc_pickup_postcode: string | null;
  doc_pickup_contact_no: string | null;
  doc_pickup_contact_area: string | null;
  doc_pickup_email: string | null;
  doc_pickup_company: string | null;
  doc_pickup_contact_name: string | null;
  doc_delivery_company: string | null;
  doc_delivery_recipient_name: string | null;
  doc_delivery_address: string | null;
  doc_delivery_city: string | null;
  doc_delivery_postcode: string | null;
  doc_delivery_contact_no: string | null;
  doc_delivery_email: string | null;
  doc_delivery_security_no: string | null;
  doc_delivery_company_alt1: string | null;
  doc_delivery_primary_receipient_contact_name: string | null;
  doc_delivery_primary_receipient_contact_area: string | null;
  doc_delivery_primary_receipient_contact_no: string | null;
  doc_delivery_primary_receipient_email: string | null;
  doc_pickup_contact_area_alt1: string | null;
  doc_delivery_recipient_name_alt1: string | null;
  doc_delivery_address_alt1: string | null;
  doc_delivery_city_alt1: string | null;
  doc_delivery_postcode_alt1: string | null;
  doc_delivery_contact_no_alt1: string | null;
  doc_delivery_company_alt2: string | null;
  doc_pickup_contact_area_alt2: string | null;
  doc_delivery_recipient_name_alt2: string | null;
  doc_delivery_address_alt2: string | null;
  doc_delivery_city_alt2: string | null;
  doc_delivery_postcode_alt2: string | null;
  doc_delivery_contact_no_alt2: string | null;
  doc_package_total_pieces: number | null;
  doc_package_pickup_date: string | null;
  doc_package_ready_hr: string | null;
  doc_package_ready_min: string | null;
  doc_package_ready_ampm: string | null;
  doc_package_office_close_hr: string | null;
  doc_package_office_close_ampm: string | null;
  doc_package_office_close_min: string | null;
  russian_visa_voucher_id: number | null;
  russian_visa_voucher_col_no: number | null;
  russian_visa_voucher_col_cost: number | null;
  rvv_first_entry_date: string | null;
  rvv_first_departure_date: string | null;
  rvv_second_entry_date: string | null;
  rvv_second_departure_date: string | null;
  rvv_list_of_cities: string | null;
  rvv_list_of_hotels: string | null;
  rvv_visa_applied_at: string | null;
  rvv_file: string | null;
  rvv_comments: string | null;
  dl_company: string | null;
  dl_nationality: number | null;
  dl_address: string | null;
  dl_city: string | null;
  dl_state: string | null;
  dl_postcode: string | null;
  dl_contact_name: string | null;
  dl_mobile: string | null;
  dl_email: string | null;
  dl_date_doc_returned: string | null;
  dl_embassy: number | null;
  dl_ref_no: string | null;
  dl_com_invoice_no: string | null;
  dl_payment_type: string | null;
  dl_visa_shipped_by: string | null;
  dl_visa_com_note_no: string | null;
  dl_visa_com_note_in: string | null;
  dl_visa_invoice_no: string | null;
  /** 0=no; 1=yes */
  is_smart_traveller: number | null;
  discount_code: string | null;
  discount_rate: number | null;
  grand_total: number | null;
  s_doc_sent: number | null;
  date_doc_sent: string | null;
  date_completed: string | null;
  /** 1=destination; 2=Review TPN; 3=Review Order; 4=Place Order; 10= ordered; 11=paid; 12=completed */
  status: number | null;
  s_archive: number | null;
  s_bulk_order: number | null;
  signature: string | null;
  sig_name: string | null;
  dhl_pickup_xml_request: string | null;
  dhl_pickup_xml_response: string | null;
  dhl_shipment_validate_xml_request: string | null;
  dhl_shipment_validate_xml_response: string | null;
  sender_name: string | null;
  sender_signature: string | null;
  sender_signed_datetime: string | null;
  s_admin_logged: number | null;
  admin_logged_id: number | null;
}

export class Orders extends Model<
  InferAttributes<Orders>,
  InferCreationAttributes<Orders>
> {
  declare order_no: CreationOptional<number>;
  declare client_id: number | null;
  declare date_last_saved: string | null;
  declare date_submitted: string | null;
  declare order_type: number | null;
  declare primary_traveller_name: string | null;
  declare primary_traveller_passport_no: string | null;
  declare destination: number | null;
  declare departure_date: string | null;
  declare pri_dept_contact_department_id: number | null;
  declare pri_dept_contact_fname: string | null;
  declare pri_dept_contact_lname: string | null;
  declare pri_dept_contact_email: string | null;
  declare pri_dept_contact_phone: string | null;
  declare tpn_qty: number | null;
  declare tpn_price: number | null;
  declare tpn_additional_qty: number | null;
  declare tpn_additional_price: number | null;
  declare visa_courier: number | null;
  declare visa_courier_price: number | null;
  declare visa_courier_pickup_date: string | null;
  declare visa_courier_pickup_ready_by_time_hr: string | null;
  declare visa_courier_pickup_ready_by_time_min: string | null;
  declare visa_courier_pickup_close_time_hr: string | null;
  declare visa_courier_pickup_close_time_min: string | null;
  declare visa_courier_pickup_contact_person_name: string | null;
  declare visa_courier_pickup_contact_person_phone: string | null;
  declare visa_courier_pickup_package_location: string | null;
  declare visa_mdd_company: string | null;
  declare visa_mdd_address: string | null;
  declare visa_mdd_city: string | null;
  declare visa_mdd_state: string | null;
  declare visa_mdd_postcode: string | null;
  declare visa_mdd_fname: string | null;
  declare visa_mdd_lname: string | null;
  declare visa_mdd_contact: string | null;
  declare visa_additional_comment: string | null;
  declare visa_cls_team_member: number | null;
  declare visa_is_delivered_to_embassy: number | null;
  declare visa_is_delivered_to_embassy_date: string | null;
  declare visa_next_embassy: string | null;
  declare passport_office_booking_no: string | null;
  declare passport_office_booking_time: string | null;
  declare passport_office_booking_time_hr: string | null;
  declare passport_office_booking_time_min: string | null;
  declare police_clearance_id: number | null;
  declare police_clearance_date_cls_received_all_items: string | null;
  declare police_clearance_date_submitted_for_processing: string | null;
  declare police_clearance_date_completed_and_received_at_cls: string | null;
  declare police_clearance_date_order_on_route_and_closed: string | null;
  declare doc_delivery_type: number | null;
  declare doc_receiver_name: string | null;
  declare doc_pickup_address: string | null;
  declare doc_pickup_city: string | null;
  declare doc_pickup_postcode: string | null;
  declare doc_pickup_contact_no: string | null;
  declare doc_pickup_contact_area: string | null;
  declare doc_pickup_email: string | null;
  declare doc_pickup_company: string | null;
  declare doc_pickup_contact_name: string | null;
  declare doc_delivery_company: string | null;
  declare doc_delivery_recipient_name: string | null;
  declare doc_delivery_address: string | null;
  declare doc_delivery_city: string | null;
  declare doc_delivery_postcode: string | null;
  declare doc_delivery_contact_no: string | null;
  declare doc_delivery_email: string | null;
  declare doc_delivery_security_no: string | null;
  declare doc_delivery_company_alt1: string | null;
  declare doc_delivery_primary_receipient_contact_name: string | null;
  declare doc_delivery_primary_receipient_contact_area: string | null;
  declare doc_delivery_primary_receipient_contact_no: string | null;
  declare doc_delivery_primary_receipient_email: string | null;
  declare doc_pickup_contact_area_alt1: string | null;
  declare doc_delivery_recipient_name_alt1: string | null;
  declare doc_delivery_address_alt1: string | null;
  declare doc_delivery_city_alt1: string | null;
  declare doc_delivery_postcode_alt1: string | null;
  declare doc_delivery_contact_no_alt1: string | null;
  declare doc_delivery_company_alt2: string | null;
  declare doc_pickup_contact_area_alt2: string | null;
  declare doc_delivery_recipient_name_alt2: string | null;
  declare doc_delivery_address_alt2: string | null;
  declare doc_delivery_city_alt2: string | null;
  declare doc_delivery_postcode_alt2: string | null;
  declare doc_delivery_contact_no_alt2: string | null;
  declare doc_package_total_pieces: number | null;
  declare doc_package_pickup_date: string | null;
  declare doc_package_ready_hr: string | null;
  declare doc_package_ready_min: string | null;
  declare doc_package_ready_ampm: string | null;
  declare doc_package_office_close_hr: string | null;
  declare doc_package_office_close_ampm: string | null;
  declare doc_package_office_close_min: string | null;
  declare russian_visa_voucher_id: number | null;
  declare russian_visa_voucher_col_no: number | null;
  declare russian_visa_voucher_col_cost: number | null;
  declare rvv_first_entry_date: string | null;
  declare rvv_first_departure_date: string | null;
  declare rvv_second_entry_date: string | null;
  declare rvv_second_departure_date: string | null;
  declare rvv_list_of_cities: string | null;
  declare rvv_list_of_hotels: string | null;
  declare rvv_visa_applied_at: string | null;
  declare rvv_file: string | null;
  declare rvv_comments: string | null;
  declare dl_company: string | null;
  declare dl_nationality: number | null;
  declare dl_address: string | null;
  declare dl_city: string | null;
  declare dl_state: string | null;
  declare dl_postcode: string | null;
  declare dl_contact_name: string | null;
  declare dl_mobile: string | null;
  declare dl_email: string | null;
  declare dl_date_doc_returned: string | null;
  declare dl_embassy: number | null;
  declare dl_ref_no: string | null;
  declare dl_com_invoice_no: string | null;
  declare dl_payment_type: string | null;
  declare dl_visa_shipped_by: string | null;
  declare dl_visa_com_note_no: string | null;
  declare dl_visa_com_note_in: string | null;
  declare dl_visa_invoice_no: string | null;
  declare is_smart_traveller: number | null;
  declare discount_code: string | null;
  declare discount_rate: number | null;
  declare grand_total: number | null;
  declare s_doc_sent: number | null;
  declare date_doc_sent: string | null;
  declare date_completed: string | null;
  declare status: number | null;
  declare s_archive: number | null;
  declare s_bulk_order: number | null;
  declare signature: string | null;
  declare sig_name: string | null;
  declare dhl_pickup_xml_request: string | null;
  declare dhl_pickup_xml_response: string | null;
  declare dhl_shipment_validate_xml_request: string | null;
  declare dhl_shipment_validate_xml_response: string | null;
  declare sender_name: string | null;
  declare sender_signature: string | null;
  declare sender_signed_datetime: string | null;
  declare s_admin_logged: number | null;
  declare admin_logged_id: number | null;
}

Orders.init(
  {
    order_no: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'order_no',
    },
    client_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'client_id',
    },
    date_last_saved: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'date_last_saved',
    },
    date_submitted: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'date_submitted',
    },
    order_type: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'order_type',
    },
    primary_traveller_name: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'primary_traveller_name',
    },
    primary_traveller_passport_no: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'primary_traveller_passport_no',
    },
    destination: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'destination',
    },
    departure_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'departure_date',
    },
    pri_dept_contact_department_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'pri_dept_contact_department_id',
    },
    pri_dept_contact_fname: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'pri_dept_contact_fname',
    },
    pri_dept_contact_lname: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'pri_dept_contact_lname',
    },
    pri_dept_contact_email: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'pri_dept_contact_email',
    },
    pri_dept_contact_phone: {
      type: DataTypes.CHAR(50),
      allowNull: true,
      field: 'pri_dept_contact_phone',
    },
    tpn_qty: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'tpn_qty',
    },
    tpn_price: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'tpn_price',
    },
    tpn_additional_qty: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'tpn_additional_qty',
    },
    tpn_additional_price: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'tpn_additional_price',
    },
    visa_courier: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'visa_courier',
    },
    visa_courier_price: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'visa_courier_price',
    },
    visa_courier_pickup_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'visa_courier_pickup_date',
    },
    visa_courier_pickup_ready_by_time_hr: {
      type: DataTypes.CHAR(10),
      allowNull: true,
      field: 'visa_courier_pickup_ready_by_time_hr',
    },
    visa_courier_pickup_ready_by_time_min: {
      type: DataTypes.CHAR(10),
      allowNull: true,
      field: 'visa_courier_pickup_ready_by_time_min',
    },
    visa_courier_pickup_close_time_hr: {
      type: DataTypes.CHAR(10),
      allowNull: true,
      field: 'visa_courier_pickup_close_time_hr',
    },
    visa_courier_pickup_close_time_min: {
      type: DataTypes.CHAR(10),
      allowNull: true,
      field: 'visa_courier_pickup_close_time_min',
    },
    visa_courier_pickup_contact_person_name: {
      type: DataTypes.CHAR(200),
      allowNull: true,
      field: 'visa_courier_pickup_contact_person_name',
    },
    visa_courier_pickup_contact_person_phone: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'visa_courier_pickup_contact_person_phone',
    },
    visa_courier_pickup_package_location: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'visa_courier_pickup_package_location',
    },
    visa_mdd_company: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'visa_mdd_company',
    },
    visa_mdd_address: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'visa_mdd_address',
    },
    visa_mdd_city: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'visa_mdd_city',
    },
    visa_mdd_state: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'visa_mdd_state',
    },
    visa_mdd_postcode: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'visa_mdd_postcode',
    },
    visa_mdd_fname: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'visa_mdd_fname',
    },
    visa_mdd_lname: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'visa_mdd_lname',
    },
    visa_mdd_contact: {
      type: DataTypes.CHAR(50),
      allowNull: true,
      field: 'visa_mdd_contact',
    },
    visa_additional_comment: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      field: 'visa_additional_comment',
    },
    visa_cls_team_member: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'visa_cls_team_member',
    },
    visa_is_delivered_to_embassy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'visa_is_delivered_to_embassy',
    },
    visa_is_delivered_to_embassy_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'visa_is_delivered_to_embassy_date',
    },
    visa_next_embassy: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'visa_next_embassy',
    },
    passport_office_booking_no: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'passport_office_booking_no',
    },
    passport_office_booking_time: {
      type: DataTypes.CHAR(50),
      allowNull: true,
      field: 'passport_office_booking_time',
    },
    passport_office_booking_time_hr: {
      type: DataTypes.CHAR(2),
      allowNull: true,
      field: 'passport_office_booking_time_hr',
    },
    passport_office_booking_time_min: {
      type: DataTypes.CHAR(2),
      allowNull: true,
      field: 'passport_office_booking_time_min',
    },
    police_clearance_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'police_clearance_id',
    },
    police_clearance_date_cls_received_all_items: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'police_clearance_date_cls_received_all_items',
    },
    police_clearance_date_submitted_for_processing: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'police_clearance_date_submitted_for_processing',
    },
    police_clearance_date_completed_and_received_at_cls: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'police_clearance_date_completed_and_received_at_cls',
    },
    police_clearance_date_order_on_route_and_closed: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'police_clearance_date_order_on_route_and_closed',
    },
    doc_delivery_type: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'doc_delivery_type',
    },
    doc_receiver_name: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'doc_receiver_name',
    },
    doc_pickup_address: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'doc_pickup_address',
    },
    doc_pickup_city: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'doc_pickup_city',
    },
    doc_pickup_postcode: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'doc_pickup_postcode',
    },
    doc_pickup_contact_no: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'doc_pickup_contact_no',
    },
    doc_pickup_contact_area: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'doc_pickup_contact_area',
    },
    doc_pickup_email: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'doc_pickup_email',
    },
    doc_pickup_company: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'doc_pickup_company',
    },
    doc_pickup_contact_name: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'doc_pickup_contact_name',
    },
    doc_delivery_company: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'doc_delivery_company',
    },
    doc_delivery_recipient_name: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'doc_delivery_recipient_name',
    },
    doc_delivery_address: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'doc_delivery_address',
    },
    doc_delivery_city: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'doc_delivery_city',
    },
    doc_delivery_postcode: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'doc_delivery_postcode',
    },
    doc_delivery_contact_no: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'doc_delivery_contact_no',
    },
    doc_delivery_email: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'doc_delivery_email',
    },
    doc_delivery_security_no: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'doc_delivery_security_no',
    },
    doc_delivery_company_alt1: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'doc_delivery_company_alt1',
    },
    doc_delivery_primary_receipient_contact_name: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'doc_delivery_primary_receipient_contact_name',
    },
    doc_delivery_primary_receipient_contact_area: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'doc_delivery_primary_receipient_contact_area',
    },
    doc_delivery_primary_receipient_contact_no: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'doc_delivery_primary_receipient_contact_no',
    },
    doc_delivery_primary_receipient_email: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'doc_delivery_primary_receipient_email',
    },
    doc_pickup_contact_area_alt1: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'doc_pickup_contact_area_alt1',
    },
    doc_delivery_recipient_name_alt1: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'doc_delivery_recipient_name_alt1',
    },
    doc_delivery_address_alt1: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'doc_delivery_address_alt1',
    },
    doc_delivery_city_alt1: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'doc_delivery_city_alt1',
    },
    doc_delivery_postcode_alt1: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'doc_delivery_postcode_alt1',
    },
    doc_delivery_contact_no_alt1: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'doc_delivery_contact_no_alt1',
    },
    doc_delivery_company_alt2: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'doc_delivery_company_alt2',
    },
    doc_pickup_contact_area_alt2: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'doc_pickup_contact_area_alt2',
    },
    doc_delivery_recipient_name_alt2: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'doc_delivery_recipient_name_alt2',
    },
    doc_delivery_address_alt2: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'doc_delivery_address_alt2',
    },
    doc_delivery_city_alt2: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'doc_delivery_city_alt2',
    },
    doc_delivery_postcode_alt2: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'doc_delivery_postcode_alt2',
    },
    doc_delivery_contact_no_alt2: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'doc_delivery_contact_no_alt2',
    },
    doc_package_total_pieces: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'doc_package_total_pieces',
    },
    doc_package_pickup_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'doc_package_pickup_date',
    },
    doc_package_ready_hr: {
      type: DataTypes.CHAR(2),
      allowNull: true,
      field: 'doc_package_ready_hr',
    },
    doc_package_ready_min: {
      type: DataTypes.CHAR(2),
      allowNull: true,
      field: 'doc_package_ready_min',
    },
    doc_package_ready_ampm: {
      type: DataTypes.CHAR(2),
      allowNull: true,
      field: 'doc_package_ready_ampm',
    },
    doc_package_office_close_hr: {
      type: DataTypes.CHAR(2),
      allowNull: true,
      field: 'doc_package_office_close_hr',
    },
    doc_package_office_close_ampm: {
      type: DataTypes.CHAR(2),
      allowNull: true,
      field: 'doc_package_office_close_ampm',
    },
    doc_package_office_close_min: {
      type: DataTypes.CHAR(2),
      allowNull: true,
      field: 'doc_package_office_close_min',
    },
    russian_visa_voucher_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'russian_visa_voucher_id',
    },
    russian_visa_voucher_col_no: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'russian_visa_voucher_col_no',
    },
    russian_visa_voucher_col_cost: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'russian_visa_voucher_col_cost',
    },
    rvv_first_entry_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'rvv_first_entry_date',
    },
    rvv_first_departure_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'rvv_first_departure_date',
    },
    rvv_second_entry_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'rvv_second_entry_date',
    },
    rvv_second_departure_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'rvv_second_departure_date',
    },
    rvv_list_of_cities: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'rvv_list_of_cities',
    },
    rvv_list_of_hotels: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'rvv_list_of_hotels',
    },
    rvv_visa_applied_at: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'rvv_visa_applied_at',
    },
    rvv_file: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'rvv_file',
    },
    rvv_comments: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      field: 'rvv_comments',
    },
    dl_company: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'dl_company',
    },
    dl_nationality: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'dl_nationality',
    },
    dl_address: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'dl_address',
    },
    dl_city: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'dl_city',
    },
    dl_state: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'dl_state',
    },
    dl_postcode: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'dl_postcode',
    },
    dl_contact_name: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'dl_contact_name',
    },
    dl_mobile: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'dl_mobile',
    },
    dl_email: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'dl_email',
    },
    dl_date_doc_returned: {
      type: DataTypes.CHAR(20),
      allowNull: true,
      field: 'dl_date_doc_returned',
    },
    dl_embassy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'dl_embassy',
    },
    dl_ref_no: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'dl_ref_no',
    },
    dl_com_invoice_no: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'dl_com_invoice_no',
    },
    dl_payment_type: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'dl_payment_type',
    },
    dl_visa_shipped_by: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'dl_visa_shipped_by',
    },
    dl_visa_com_note_no: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'dl_visa_com_note_no',
    },
    dl_visa_com_note_in: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'dl_visa_com_note_in',
    },
    dl_visa_invoice_no: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'dl_visa_invoice_no',
    },
    is_smart_traveller: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'is_smart_traveller',
    },
    discount_code: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'discount_code',
    },
    discount_rate: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'discount_rate',
    },
    grand_total: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'grand_total',
    },
    s_doc_sent: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 's_doc_sent',
    },
    date_doc_sent: {
      type: DataTypes.CHAR(10),
      allowNull: true,
      field: 'date_doc_sent',
    },
    date_completed: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'date_completed',
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'status',
    },
    s_archive: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 's_archive',
    },
    s_bulk_order: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 's_bulk_order',
    },
    signature: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'signature',
    },
    sig_name: {
      type: DataTypes.CHAR(250),
      allowNull: true,
      field: 'sig_name',
    },
    dhl_pickup_xml_request: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'dhl_pickup_xml_request',
    },
    dhl_pickup_xml_response: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'dhl_pickup_xml_response',
    },
    dhl_shipment_validate_xml_request: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'dhl_shipment_validate_xml_request',
    },
    dhl_shipment_validate_xml_response: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'dhl_shipment_validate_xml_response',
    },
    sender_name: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'sender_name',
    },
    sender_signature: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'sender_signature',
    },
    sender_signed_datetime: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'sender_signed_datetime',
    },
    s_admin_logged: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      field: 's_admin_logged',
    },
    admin_logged_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'admin_logged_id',
    },
  },
  {
    sequelize,
    tableName: 'tbl_orders',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default Orders;
