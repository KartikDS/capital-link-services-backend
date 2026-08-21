/**
 * `tbl_states` — InnoDB, latin1.
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
export interface StatesAttributes {
  id: number;
  name: string | null;
  code: string | null;
  s_main: number | null;
  country_id: number | null;
}

export class States extends Model<
  InferAttributes<States>,
  InferCreationAttributes<States>
> {
  declare id: CreationOptional<number>;
  declare name: string | null;
  declare code: string | null;
  declare s_main: number | null;
  declare country_id: number | null;
}

States.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    name: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'name',
    },
    code: {
      type: DataTypes.CHAR(5),
      allowNull: true,
      field: 'code',
    },
    s_main: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 's_main',
    },
    country_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'country_id',
    },
  },
  {
    sequelize,
    tableName: 'tbl_states',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default States;
