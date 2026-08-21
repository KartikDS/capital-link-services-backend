/**
 * `tbl_payment` — InnoDB, latin1.
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
export interface PaymentAttributes {
  id: number;
  client_id: number | null;
  order_no: number | null;
  date_paid: string | null;
  fname: string | null;
  lname: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country_id: number | null;
  additional_address_details: string | null;
  department_id: number | null;
  mba_organisation_name: string | null;
  mba_fname: string | null;
  mba_lname: string | null;
  mba_address: string | null;
  mba_city: string | null;
  mba_state: string | null;
  mba_postcode: string | null;
  mba_country_id: number | null;
  /** 0 = account; 1=creditcard */
  payment_option: number | null;
  account_no: string | null;
  name_on_card: string | null;
  card_number: string | null;
  card_expiry_month: number | null;
  card_expiry_year: number | null;
  card_type: number | null;
  ccv_number: string | null;
  doc_receiver_name: string | null;
  doc_pickup_address: string | null;
  doc_pickup_city: string | null;
  doc_pickup_postcode: string | null;
  doc_pickup_contact_no: string | null;
  doc_delivery_recipient_name: string | null;
  doc_delivery_address: string | null;
  doc_delivery_city: string | null;
  doc_delivery_postcode: string | null;
  doc_delivery_contact_no: string | null;
  doc_package_total_pieces: number | null;
  doc_package_pickup_date: string | null;
  doc_package_ready_hr: string | null;
  doc_package_ready_min: string | null;
  doc_package_office_close_hr: string | null;
  doc_package_office_close_min: string | null;
  total_order_price: number | null;
  /** 1=online; 2=by account */
  s_paid: number | null;
  transaction_id: string | null;
  /** 0=>failed,1=>complete */
  payment_status: number | null;
}

export class Payment extends Model<
  InferAttributes<Payment>,
  InferCreationAttributes<Payment>
> {
  declare id: CreationOptional<number>;
  declare client_id: number | null;
  declare order_no: number | null;
  declare date_paid: string | null;
  declare fname: string | null;
  declare lname: string | null;
  declare email: string | null;
  declare phone: string | null;
  declare mobile: string | null;
  declare address: string | null;
  declare city: string | null;
  declare state: string | null;
  declare postcode: string | null;
  declare country_id: number | null;
  declare additional_address_details: string | null;
  declare department_id: number | null;
  declare mba_organisation_name: string | null;
  declare mba_fname: string | null;
  declare mba_lname: string | null;
  declare mba_address: string | null;
  declare mba_city: string | null;
  declare mba_state: string | null;
  declare mba_postcode: string | null;
  declare mba_country_id: number | null;
  declare payment_option: number | null;
  declare account_no: string | null;
  declare name_on_card: string | null;
  declare card_number: string | null;
  declare card_expiry_month: number | null;
  declare card_expiry_year: number | null;
  declare card_type: number | null;
  declare ccv_number: string | null;
  declare doc_receiver_name: string | null;
  declare doc_pickup_address: string | null;
  declare doc_pickup_city: string | null;
  declare doc_pickup_postcode: string | null;
  declare doc_pickup_contact_no: string | null;
  declare doc_delivery_recipient_name: string | null;
  declare doc_delivery_address: string | null;
  declare doc_delivery_city: string | null;
  declare doc_delivery_postcode: string | null;
  declare doc_delivery_contact_no: string | null;
  declare doc_package_total_pieces: number | null;
  declare doc_package_pickup_date: string | null;
  declare doc_package_ready_hr: string | null;
  declare doc_package_ready_min: string | null;
  declare doc_package_office_close_hr: string | null;
  declare doc_package_office_close_min: string | null;
  declare total_order_price: number | null;
  declare s_paid: number | null;
  declare transaction_id: string | null;
  declare payment_status: number | null;
}

Payment.init(
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
    order_no: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'order_no',
    },
    date_paid: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'date_paid',
    },
    fname: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'fname',
    },
    lname: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'lname',
    },
    email: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'email',
    },
    phone: {
      type: DataTypes.CHAR(50),
      allowNull: true,
      field: 'phone',
    },
    mobile: {
      type: DataTypes.CHAR(50),
      allowNull: true,
      field: 'mobile',
    },
    address: {
      type: DataTypes.STRING(5000),
      allowNull: true,
      field: 'address',
    },
    city: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'city',
    },
    state: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'state',
    },
    postcode: {
      type: DataTypes.CHAR(50),
      allowNull: true,
      field: 'postcode',
    },
    country_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'country_id',
    },
    additional_address_details: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      field: 'additional_address_details',
    },
    department_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'department_id',
    },
    mba_organisation_name: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'mba_organisation_name',
    },
    mba_fname: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'mba_fname',
    },
    mba_lname: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'mba_lname',
    },
    mba_address: {
      type: DataTypes.STRING(5000),
      allowNull: true,
      field: 'mba_address',
    },
    mba_city: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'mba_city',
    },
    mba_state: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'mba_state',
    },
    mba_postcode: {
      type: DataTypes.CHAR(50),
      allowNull: true,
      field: 'mba_postcode',
    },
    mba_country_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'mba_country_id',
    },
    payment_option: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'payment_option',
    },
    account_no: {
      type: DataTypes.CHAR(50),
      allowNull: true,
      field: 'account_no',
    },
    name_on_card: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'name_on_card',
    },
    card_number: {
      type: DataTypes.CHAR(50),
      allowNull: true,
      field: 'card_number',
    },
    card_expiry_month: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'card_expiry_month',
    },
    card_expiry_year: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'card_expiry_year',
    },
    card_type: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'card_type',
    },
    ccv_number: {
      type: DataTypes.CHAR(50),
      allowNull: true,
      field: 'ccv_number',
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
    doc_package_office_close_hr: {
      type: DataTypes.CHAR(2),
      allowNull: true,
      field: 'doc_package_office_close_hr',
    },
    doc_package_office_close_min: {
      type: DataTypes.CHAR(2),
      allowNull: true,
      field: 'doc_package_office_close_min',
    },
    total_order_price: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'total_order_price',
    },
    s_paid: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 's_paid',
    },
    transaction_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'transaction_id',
    },
    payment_status: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'payment_status',
    },
  },
  {
    sequelize,
    tableName: 'tbl_payment',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default Payment;
