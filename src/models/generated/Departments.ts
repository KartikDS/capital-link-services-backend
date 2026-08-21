/**
 * `tbl_departments` — InnoDB, latin1.
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
export interface DepartmentsAttributes {
  id: number;
  code: string | null;
  name: string | null;
}

export class Departments extends Model<
  InferAttributes<Departments>,
  InferCreationAttributes<Departments>
> {
  declare id: CreationOptional<number>;
  declare code: string | null;
  declare name: string | null;
}

Departments.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    code: {
      type: DataTypes.CHAR(10),
      allowNull: true,
      field: 'code',
    },
    name: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'name',
    },
  },
  {
    sequelize,
    tableName: 'tbl_departments',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default Departments;
