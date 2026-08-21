/**
 * `tbl_passport_types` — InnoDB, latin1.
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
export interface PassportTypesAttributes {
  id: number;
  type: string | null;
}

export class PassportTypes extends Model<
  InferAttributes<PassportTypes>,
  InferCreationAttributes<PassportTypes>
> {
  declare id: CreationOptional<number>;
  declare type: string | null;
}

PassportTypes.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    type: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'type',
    },
  },
  {
    sequelize,
    tableName: 'tbl_passport_types',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default PassportTypes;
