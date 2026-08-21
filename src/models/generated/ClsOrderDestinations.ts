/**
 * `tbl_cls_order_destinations` — InnoDB, latin1.
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
export interface ClsOrderDestinationsAttributes {
  id: number;
  order_id: number | null;
  country_id: number | null;
  visa_type_id: number | null;
  /** 1=single,2=double,3=multiple */
  entry_option: number | null;
  process_location_id: number | null;
  nationality: number | null;
  region: string | null;
  visa_additional_requirement_id: number | null;
  departure_date: string | null;
  entry_date_country: string | null;
  departure_date_country: string | null;
  visa_cls_team_member: number | null;
  visa_is_delivered_to_embassy: number | null;
  visa_is_delivered_to_embassy_date: string | null;
  visa_next_embassy: string | null;
  visa_follow_up_date: string | null;
  travel_purpose: string | null;
  selected_visa_type_price: string | null;
  selected_additional_requirement_price: string | null;
  selected_visa_type_requirements: string | null;
  visa_date_cls_received_all_items: string | null;
  visa_date_submitted_for_processing: string | null;
  visa_date_completed_and_received_at_cls: string | null;
  visa_date_order_on_route_and_closed: string | null;
  visa_com_note_no: string | null;
  visa_com_note_in: string | null;
  visa_invoice_no: string | null;
  visa_shipped_by: string | null;
  return_visa_shipped_by: string | null;
  signature: string | null;
  sig_name: string | null;
  dhl_confirmation_number: string | null;
  dhl_airwaybill_number: string | null;
  dhl_pickup_xml_request: string | null;
  dhl_pickup_xml_response: string | null;
  dhl_shipment_validate_xml_request: string | null;
  dhl_shipment_validate_label: string | null;
  return_dhl_airwaybill_number: string | null;
  return_dhl_confirmation_number: string | null;
  return_dhl_pickup_xml_request: string | null;
  return_dhl_pickup_xml_response: string | null;
  return_dhl_shipment_validate_xml_request: string | null;
  return_dhl_shipment_validate_label: string | null;
  s_primary: number | null;
  status: number | null;
}

export class ClsOrderDestinations extends Model<
  InferAttributes<ClsOrderDestinations>,
  InferCreationAttributes<ClsOrderDestinations>
> {
  declare id: CreationOptional<number>;
  declare order_id: number | null;
  declare country_id: number | null;
  declare visa_type_id: number | null;
  declare entry_option: number | null;
  declare process_location_id: number | null;
  declare nationality: number | null;
  declare region: string | null;
  declare visa_additional_requirement_id: number | null;
  declare departure_date: string | null;
  declare entry_date_country: string | null;
  declare departure_date_country: string | null;
  declare visa_cls_team_member: number | null;
  declare visa_is_delivered_to_embassy: number | null;
  declare visa_is_delivered_to_embassy_date: string | null;
  declare visa_next_embassy: string | null;
  declare visa_follow_up_date: string | null;
  declare travel_purpose: string | null;
  declare selected_visa_type_price: string | null;
  declare selected_additional_requirement_price: string | null;
  declare selected_visa_type_requirements: string | null;
  declare visa_date_cls_received_all_items: string | null;
  declare visa_date_submitted_for_processing: string | null;
  declare visa_date_completed_and_received_at_cls: string | null;
  declare visa_date_order_on_route_and_closed: string | null;
  declare visa_com_note_no: string | null;
  declare visa_com_note_in: string | null;
  declare visa_invoice_no: string | null;
  declare visa_shipped_by: string | null;
  declare return_visa_shipped_by: string | null;
  declare signature: string | null;
  declare sig_name: string | null;
  declare dhl_confirmation_number: string | null;
  declare dhl_airwaybill_number: string | null;
  declare dhl_pickup_xml_request: string | null;
  declare dhl_pickup_xml_response: string | null;
  declare dhl_shipment_validate_xml_request: string | null;
  declare dhl_shipment_validate_label: string | null;
  declare return_dhl_airwaybill_number: string | null;
  declare return_dhl_confirmation_number: string | null;
  declare return_dhl_pickup_xml_request: string | null;
  declare return_dhl_pickup_xml_response: string | null;
  declare return_dhl_shipment_validate_xml_request: string | null;
  declare return_dhl_shipment_validate_label: string | null;
  declare s_primary: number | null;
  declare status: number | null;
}

ClsOrderDestinations.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    order_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'order_id',
    },
    country_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'country_id',
    },
    visa_type_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'visa_type_id',
    },
    entry_option: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'entry_option',
    },
    process_location_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'process_location_id',
    },
    nationality: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'nationality',
    },
    region: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'region',
    },
    visa_additional_requirement_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'visa_additional_requirement_id',
    },
    departure_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'departure_date',
    },
    entry_date_country: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'entry_date_country',
    },
    departure_date_country: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'departure_date_country',
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
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'visa_next_embassy',
    },
    visa_follow_up_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'visa_follow_up_date',
    },
    travel_purpose: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'travel_purpose',
    },
    selected_visa_type_price: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'selected_visa_type_price',
    },
    selected_additional_requirement_price: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'selected_additional_requirement_price',
    },
    selected_visa_type_requirements: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'selected_visa_type_requirements',
    },
    visa_date_cls_received_all_items: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'visa_date_cls_received_all_items',
    },
    visa_date_submitted_for_processing: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'visa_date_submitted_for_processing',
    },
    visa_date_completed_and_received_at_cls: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'visa_date_completed_and_received_at_cls',
    },
    visa_date_order_on_route_and_closed: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'visa_date_order_on_route_and_closed',
    },
    visa_com_note_no: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'visa_com_note_no',
    },
    visa_com_note_in: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'visa_com_note_in',
    },
    visa_invoice_no: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'visa_invoice_no',
    },
    visa_shipped_by: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'visa_shipped_by',
    },
    return_visa_shipped_by: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'return_visa_shipped_by',
    },
    signature: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'signature',
    },
    sig_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'sig_name',
    },
    dhl_confirmation_number: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'dhl_confirmation_number',
    },
    dhl_airwaybill_number: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'dhl_airwaybill_number',
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
    dhl_shipment_validate_label: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      field: 'dhl_shipment_validate_label',
    },
    return_dhl_airwaybill_number: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'return_dhl_airwaybill_number',
    },
    return_dhl_confirmation_number: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'return_dhl_confirmation_number',
    },
    return_dhl_pickup_xml_request: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'return_dhl_pickup_xml_request',
    },
    return_dhl_pickup_xml_response: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'return_dhl_pickup_xml_response',
    },
    return_dhl_shipment_validate_xml_request: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'return_dhl_shipment_validate_xml_request',
    },
    return_dhl_shipment_validate_label: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      field: 'return_dhl_shipment_validate_label',
    },
    s_primary: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 's_primary',
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'status',
    },
  },
  {
    sequelize,
    tableName: 'tbl_cls_order_destinations',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default ClsOrderDestinations;
