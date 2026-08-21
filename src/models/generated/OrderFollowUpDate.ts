/**
 * `tbl_order_follow_up_date` — InnoDB, latin1.
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
export interface OrderFollowUpDateAttributes {
  id: number;
  admin_id: number | null;
  order_id: number | null;
  follow_up_date: string | null;
}

export class OrderFollowUpDate extends Model<
  InferAttributes<OrderFollowUpDate>,
  InferCreationAttributes<OrderFollowUpDate>
> {
  declare id: CreationOptional<number>;
  declare admin_id: number | null;
  declare order_id: number | null;
  declare follow_up_date: string | null;
}

OrderFollowUpDate.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    admin_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'admin_id',
    },
    order_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'order_id',
    },
    follow_up_date: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'follow_up_date',
    },
  },
  {
    sequelize,
    tableName: 'tbl_order_follow_up_date',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default OrderFollowUpDate;
