/**
 * `tbl_order_destinations` — InnoDB, latin1.
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
export interface OrderDestinationsAttributes {
  id: number;
  order_no: number | null;
  country_id: number | null;
  departure_date: string | null;
  /** 1=single; 2=double; 3=multiple */
  entry_option: number | null;
  entry_date_country: string | null;
  departure_date_country: string | null;
  travel_purpose: string | null;
  selected_visa_type: number | null;
  selected_visa_type_price: number | null;
  selected_visa_type_requirements: string | null;
  s_primary: number | null;
  status: number | null;
  visa_date_cls_received_all_items: string | null;
  visa_date_submitted_for_processing: string | null;
  visa_date_completed_and_received_at_cls: string | null;
  visa_date_order_on_route_and_closed: string | null;
  visa_shipped_by: string | null;
  visa_com_note_no: string | null;
  visa_com_note_in: string | null;
  visa_invoice_no: string | null;
  visa_follow_up_date: string | null;
  tpn_stat: number | null;
  tpn_middle_src: string | null;
  tpn_date_issued: string | null;
  signature: string | null;
  sig_hash: string | null;
  sig_name: string | null;
  dhl_airwaybill_number: string | null;
}

export class OrderDestinations extends Model<
  InferAttributes<OrderDestinations>,
  InferCreationAttributes<OrderDestinations>
> {
  declare id: CreationOptional<number>;
  declare order_no: number | null;
  declare country_id: number | null;
  declare departure_date: string | null;
  declare entry_option: number | null;
  declare entry_date_country: string | null;
  declare departure_date_country: string | null;
  declare travel_purpose: string | null;
  declare selected_visa_type: number | null;
  declare selected_visa_type_price: number | null;
  declare selected_visa_type_requirements: string | null;
  declare s_primary: number | null;
  declare status: number | null;
  declare visa_date_cls_received_all_items: string | null;
  declare visa_date_submitted_for_processing: string | null;
  declare visa_date_completed_and_received_at_cls: string | null;
  declare visa_date_order_on_route_and_closed: string | null;
  declare visa_shipped_by: string | null;
  declare visa_com_note_no: string | null;
  declare visa_com_note_in: string | null;
  declare visa_invoice_no: string | null;
  declare visa_follow_up_date: string | null;
  declare tpn_stat: number | null;
  declare tpn_middle_src: string | null;
  declare tpn_date_issued: string | null;
  declare signature: string | null;
  declare sig_hash: string | null;
  declare sig_name: string | null;
  declare dhl_airwaybill_number: string | null;
}

OrderDestinations.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    order_no: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'order_no',
    },
    country_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'country_id',
    },
    departure_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'departure_date',
    },
    entry_option: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'entry_option',
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
    travel_purpose: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      field: 'travel_purpose',
    },
    selected_visa_type: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'selected_visa_type',
    },
    selected_visa_type_price: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'selected_visa_type_price',
    },
    selected_visa_type_requirements: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'selected_visa_type_requirements',
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
    visa_shipped_by: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'visa_shipped_by',
    },
    visa_com_note_no: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'visa_com_note_no',
    },
    visa_com_note_in: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'visa_com_note_in',
    },
    visa_invoice_no: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'visa_invoice_no',
    },
    visa_follow_up_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'visa_follow_up_date',
    },
    tpn_stat: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'tpn_stat',
    },
    tpn_middle_src: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      field: 'tpn_middle_src',
    },
    tpn_date_issued: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'tpn_date_issued',
    },
    signature: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'signature',
    },
    sig_hash: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: 'sig_hash',
    },
    sig_name: {
      type: DataTypes.CHAR(150),
      allowNull: true,
      field: 'sig_name',
    },
    dhl_airwaybill_number: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'dhl_airwaybill_number',
    },
  },
  {
    sequelize,
    tableName: 'tbl_order_destinations',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default OrderDestinations;
