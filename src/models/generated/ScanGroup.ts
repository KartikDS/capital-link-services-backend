/**
 * `tbl_scan_group` — InnoDB, latin1.
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
export interface ScanGroupAttributes {
  id: number;
  order_no: number | null;
  type: string | null;
  status: string | null;
  user_id: number | null;
}

export class ScanGroup extends Model<
  InferAttributes<ScanGroup>,
  InferCreationAttributes<ScanGroup>
> {
  declare id: CreationOptional<number>;
  declare order_no: number | null;
  declare type: string | null;
  declare status: string | null;
  declare user_id: number | null;
}

ScanGroup.init(
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
    type: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'type',
    },
    status: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'status',
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'user_id',
    },
  },
  {
    sequelize,
    tableName: 'tbl_scan_group',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default ScanGroup;
