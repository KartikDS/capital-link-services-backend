/**
 * `tbl_name_title` — InnoDB, latin1.
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
export interface NameTitleAttributes {
  id: number;
  title: string | null;
  gender: string | null;
  priority: number | null;
  is_rvv: number;
}

export class NameTitle extends Model<
  InferAttributes<NameTitle>,
  InferCreationAttributes<NameTitle>
> {
  declare id: CreationOptional<number>;
  declare title: string | null;
  declare gender: string | null;
  declare priority: number | null;
  declare is_rvv: CreationOptional<number>;
}

NameTitle.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    title: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'title',
    },
    gender: {
      type: DataTypes.CHAR(1),
      allowNull: true,
      field: 'gender',
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'priority',
    },
    is_rvv: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'is_rvv',
    },
  },
  {
    sequelize,
    tableName: 'tbl_name_title',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default NameTitle;
