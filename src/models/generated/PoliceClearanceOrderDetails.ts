/**
 * `tbl_police_clearance_order_details` — InnoDB, latin1.
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
export interface PoliceClearanceOrderDetailsAttributes {
  id: number;
  order_id: number | null;
  police_clearance_id: number | null;
  clearance_price: string | null;
  basic_additional_price: string | null;
  clearance_additional_price: string | null;
  date_cls_received_all_items: string | null;
  date_submitted_for_processing: string | null;
  date_completed_and_received_at_cls: string | null;
  date_order_on_route_and_closed: string | null;
  status: number | null;
}

export class PoliceClearanceOrderDetails extends Model<
  InferAttributes<PoliceClearanceOrderDetails>,
  InferCreationAttributes<PoliceClearanceOrderDetails>
> {
  declare id: CreationOptional<number>;
  declare order_id: number | null;
  declare police_clearance_id: number | null;
  declare clearance_price: string | null;
  declare basic_additional_price: string | null;
  declare clearance_additional_price: string | null;
  declare date_cls_received_all_items: string | null;
  declare date_submitted_for_processing: string | null;
  declare date_completed_and_received_at_cls: string | null;
  declare date_order_on_route_and_closed: string | null;
  declare status: number | null;
}

PoliceClearanceOrderDetails.init(
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
    police_clearance_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'police_clearance_id',
    },
    clearance_price: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'clearance_price',
    },
    basic_additional_price: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'basic_additional_price',
    },
    clearance_additional_price: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'clearance_additional_price',
    },
    date_cls_received_all_items: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'date_cls_received_all_items',
    },
    date_submitted_for_processing: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'date_submitted_for_processing',
    },
    date_completed_and_received_at_cls: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'date_completed_and_received_at_cls',
    },
    date_order_on_route_and_closed: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'date_order_on_route_and_closed',
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'status',
    },
  },
  {
    sequelize,
    tableName: 'tbl_police_clearance_order_details',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default PoliceClearanceOrderDetails;
