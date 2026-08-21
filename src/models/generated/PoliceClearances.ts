/**
 * `tbl_police_clearances` — MyISAM, latin1.
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
export interface PoliceClearancesAttributes {
  id: number;
  name: string | null;
  price: number | null;
  name_additional: string | null;
  price_additional: number | null;
  status: number | null;
  file_path: string | null;
  gen_info: string | null;
}

export class PoliceClearances extends Model<
  InferAttributes<PoliceClearances>,
  InferCreationAttributes<PoliceClearances>
> {
  declare id: CreationOptional<number>;
  declare name: string | null;
  declare price: number | null;
  declare name_additional: string | null;
  declare price_additional: number | null;
  declare status: number | null;
  declare file_path: string | null;
  declare gen_info: string | null;
}

PoliceClearances.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    name: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'name',
    },
    price: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'price',
    },
    name_additional: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'name_additional',
    },
    price_additional: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'price_additional',
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'status',
    },
    file_path: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'file_path',
    },
    gen_info: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      field: 'gen_info',
    },
  },
  {
    sequelize,
    tableName: 'tbl_police_clearances',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default PoliceClearances;
