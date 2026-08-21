/**
 * `tbl_cls_order` — InnoDB, latin1.
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
export interface ClsOrderAttributes {
  id: number;
  client_id: number | null;
  visa_type: string | null;
  /** 1=visa; 2=tpn; 3=tpn+visa; 4=passport delivery; 5=police clearance; 6=public visa; 7=document delivery; 8=russian visa voucher; 9=DL */
  order_type: number | null;
  service_id: number | null;
  courier_service_id: number | null;
  police_clearance_id: number | null;
  russian_visa_voucher_id: number | null;
  /** country_id */
  destination: number | null;
  departure_date: string | null;
  visa_fee: string | null;
  no_of_traveller: number | null;
  visa_application_fee: string | null;
  service_fee: string | null;
  additional_service_fee: string | null;
  courier_service_fee: string | null;
  total_fee: string | null;
  /** 1=traveller; 2=OrderContact */
  order_contact_option: number | null;
  department: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  visa_cls_team_member: number | null;
  visa_is_delivered_to_embassy: number | null;
  visa_is_delivered_to_embassy_date: string | null;
  visa_next_embassy: string | null;
  s_admin_logged: number | null;
  admin_logged_id: number | null;
  /** 0=pending; 1=completed; 2=cls_confirmed */
  status: number | null;
  process_location_group: number | null;
  is_address_confirmed: number | null;
  date_last_saved: string | null;
  date_submitted: string | null;
  order_no: string | null;
  payment_status: number | null;
  is_bulk: number | null;
}

export class ClsOrder extends Model<
  InferAttributes<ClsOrder>,
  InferCreationAttributes<ClsOrder>
> {
  declare id: CreationOptional<number>;
  declare client_id: number | null;
  declare visa_type: string | null;
  declare order_type: number | null;
  declare service_id: number | null;
  declare courier_service_id: number | null;
  declare police_clearance_id: number | null;
  declare russian_visa_voucher_id: number | null;
  declare destination: number | null;
  declare departure_date: string | null;
  declare visa_fee: string | null;
  declare no_of_traveller: number | null;
  declare visa_application_fee: string | null;
  declare service_fee: string | null;
  declare additional_service_fee: string | null;
  declare courier_service_fee: string | null;
  declare total_fee: string | null;
  declare order_contact_option: number | null;
  declare department: string | null;
  declare contact_first_name: string | null;
  declare contact_last_name: string | null;
  declare contact_email: string | null;
  declare contact_phone: string | null;
  declare visa_cls_team_member: number | null;
  declare visa_is_delivered_to_embassy: number | null;
  declare visa_is_delivered_to_embassy_date: string | null;
  declare visa_next_embassy: string | null;
  declare s_admin_logged: number | null;
  declare admin_logged_id: number | null;
  declare status: number | null;
  declare process_location_group: number | null;
  declare is_address_confirmed: number | null;
  declare date_last_saved: string | null;
  declare date_submitted: string | null;
  declare order_no: string | null;
  declare payment_status: number | null;
  declare is_bulk: number | null;
}

ClsOrder.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    client_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'client_id',
    },
    visa_type: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'visa_type',
    },
    order_type: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'order_type',
    },
    service_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'service_id',
    },
    courier_service_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'courier_service_id',
    },
    police_clearance_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'police_clearance_id',
    },
    russian_visa_voucher_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'russian_visa_voucher_id',
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
    visa_fee: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'visa_fee',
    },
    no_of_traveller: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'no_of_traveller',
    },
    visa_application_fee: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'visa_application_fee',
    },
    service_fee: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'service_fee',
    },
    additional_service_fee: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'additional_service_fee',
    },
    courier_service_fee: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'courier_service_fee',
    },
    total_fee: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'total_fee',
    },
    order_contact_option: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'order_contact_option',
    },
    department: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'department',
    },
    contact_first_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'contact_first_name',
    },
    contact_last_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'contact_last_name',
    },
    contact_email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'contact_email',
    },
    contact_phone: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'contact_phone',
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
    s_admin_logged: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 's_admin_logged',
    },
    admin_logged_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'admin_logged_id',
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'status',
    },
    process_location_group: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'process_location_group',
    },
    is_address_confirmed: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      field: 'is_address_confirmed',
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
    order_no: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'order_no',
    },
    payment_status: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      field: 'payment_status',
    },
    is_bulk: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      field: 'is_bulk',
    },
  },
  {
    sequelize,
    tableName: 'tbl_cls_order',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default ClsOrder;
