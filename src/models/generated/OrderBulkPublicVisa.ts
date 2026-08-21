/**
 * `tbl_order_bulk_public_visa` — InnoDB, latin1.
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
export interface OrderBulkPublicVisaAttributes {
  bulk_order_no: number;
  client_id: number | null;
  /** draft; sent */
  status: string | null;
  /** 1=details; 2=review; 3=place order */
  level: number | null;
  discount_rate: number | null;
  discount_code: string | null;
  grand_total: number | null;
  payment_option: number | null;
  date_last_saved: string | null;
  dd_company: string | null;
  dd_doc_return_address: string | null;
  dd_city: string | null;
  dd_state: string | null;
  dd_postcode: string | null;
  dd_fname: string | null;
  dd_lname: string | null;
  dd_contact_no: string | null;
  dd_additional_comment: string | null;
}

export class OrderBulkPublicVisa extends Model<
  InferAttributes<OrderBulkPublicVisa>,
  InferCreationAttributes<OrderBulkPublicVisa>
> {
  declare bulk_order_no: CreationOptional<number>;
  declare client_id: number | null;
  declare status: string | null;
  declare level: number | null;
  declare discount_rate: number | null;
  declare discount_code: string | null;
  declare grand_total: number | null;
  declare payment_option: number | null;
  declare date_last_saved: string | null;
  declare dd_company: string | null;
  declare dd_doc_return_address: string | null;
  declare dd_city: string | null;
  declare dd_state: string | null;
  declare dd_postcode: string | null;
  declare dd_fname: string | null;
  declare dd_lname: string | null;
  declare dd_contact_no: string | null;
  declare dd_additional_comment: string | null;
}

OrderBulkPublicVisa.init(
  {
    bulk_order_no: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'bulk_order_no',
    },
    client_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'client_id',
    },
    status: {
      type: DataTypes.CHAR(10),
      allowNull: true,
      field: 'status',
    },
    level: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'level',
    },
    discount_rate: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'discount_rate',
    },
    discount_code: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'discount_code',
    },
    grand_total: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'grand_total',
    },
    payment_option: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'payment_option',
    },
    date_last_saved: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'date_last_saved',
    },
    dd_company: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'dd_company',
    },
    dd_doc_return_address: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'dd_doc_return_address',
    },
    dd_city: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'dd_city',
    },
    dd_state: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'dd_state',
    },
    dd_postcode: {
      type: DataTypes.CHAR(50),
      allowNull: true,
      field: 'dd_postcode',
    },
    dd_fname: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'dd_fname',
    },
    dd_lname: {
      type: DataTypes.CHAR(220),
      allowNull: true,
      field: 'dd_lname',
    },
    dd_contact_no: {
      type: DataTypes.CHAR(50),
      allowNull: true,
      field: 'dd_contact_no',
    },
    dd_additional_comment: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'dd_additional_comment',
    },
  },
  {
    sequelize,
    tableName: 'tbl_order_bulk_public_visa',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default OrderBulkPublicVisa;
