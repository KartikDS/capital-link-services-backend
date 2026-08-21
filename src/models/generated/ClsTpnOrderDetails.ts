/**
 * `tbl_cls_tpn_order_details` — InnoDB, latin1.
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
export interface ClsTpnOrderDetailsAttributes {
  id: number;
  order_id: number | null;
  tpn_qty: number | null;
  tpn_price: string | null;
  tpn_additional_qty: number | null;
  tpn_additional_price: string | null;
  status: number | null;
}

export class ClsTpnOrderDetails extends Model<
  InferAttributes<ClsTpnOrderDetails>,
  InferCreationAttributes<ClsTpnOrderDetails>
> {
  declare id: CreationOptional<number>;
  declare order_id: number | null;
  declare tpn_qty: number | null;
  declare tpn_price: string | null;
  declare tpn_additional_qty: number | null;
  declare tpn_additional_price: string | null;
  declare status: number | null;
}

ClsTpnOrderDetails.init(
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
    tpn_qty: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'tpn_qty',
    },
    tpn_price: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'tpn_price',
    },
    tpn_additional_qty: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'tpn_additional_qty',
    },
    tpn_additional_price: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'tpn_additional_price',
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'status',
    },
  },
  {
    sequelize,
    tableName: 'tbl_cls_tpn_order_details',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default ClsTpnOrderDetails;
