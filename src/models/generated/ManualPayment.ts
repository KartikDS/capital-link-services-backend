/**
 * `tbl_manual_payment` — InnoDB, latin1.
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
export interface ManualPaymentAttributes {
  id: number;
  order_no: string | null;
  cust_name: string | null;
  cust_email: string | null;
  items: string | null;
  payment_details: string | null;
  billing_details: string | null;
  card_details: string | null;
  grand_total: number | null;
}

export class ManualPayment extends Model<
  InferAttributes<ManualPayment>,
  InferCreationAttributes<ManualPayment>
> {
  declare id: CreationOptional<number>;
  declare order_no: string | null;
  declare cust_name: string | null;
  declare cust_email: string | null;
  declare items: string | null;
  declare payment_details: string | null;
  declare billing_details: string | null;
  declare card_details: string | null;
  declare grand_total: number | null;
}

ManualPayment.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    order_no: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'order_no',
    },
    cust_name: {
      type: DataTypes.CHAR(200),
      allowNull: true,
      field: 'cust_name',
    },
    cust_email: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'cust_email',
    },
    items: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'items',
    },
    payment_details: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'payment_details',
    },
    billing_details: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'billing_details',
    },
    card_details: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'card_details',
    },
    grand_total: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'grand_total',
    },
  },
  {
    sequelize,
    tableName: 'tbl_manual_payment',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default ManualPayment;
