/**
 * `tbl_order_dl_quotes` — InnoDB, latin1.
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
export interface OrderDlQuotesAttributes {
  id: number;
  order_no: number | null;
  description: string | null;
  quantity: number | null;
  price: number | null;
  gst: number | null;
  total: number | null;
  admin_id: number | null;
  sent_group: number | null;
  sent_date: string | null;
}

export class OrderDlQuotes extends Model<
  InferAttributes<OrderDlQuotes>,
  InferCreationAttributes<OrderDlQuotes>
> {
  declare id: CreationOptional<number>;
  declare order_no: number | null;
  declare description: string | null;
  declare quantity: number | null;
  declare price: number | null;
  declare gst: number | null;
  declare total: number | null;
  declare admin_id: number | null;
  declare sent_group: number | null;
  declare sent_date: string | null;
}

OrderDlQuotes.init(
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
    description: {
      type: DataTypes.STRING(2000),
      allowNull: true,
      field: 'description',
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'quantity',
    },
    price: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'price',
    },
    gst: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'gst',
    },
    total: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'total',
    },
    admin_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'admin_id',
    },
    sent_group: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'sent_group',
    },
    sent_date: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'sent_date',
    },
  },
  {
    sequelize,
    tableName: 'tbl_order_dl_quotes',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default OrderDlQuotes;
