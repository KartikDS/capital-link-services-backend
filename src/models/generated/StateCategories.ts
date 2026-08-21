/**
 * `tbl_state_categories` — InnoDB, latin1.
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
export interface StateCategoriesAttributes {
  id: number;
  state_code: string | null;
  category_id: number | null;
}

export class StateCategories extends Model<
  InferAttributes<StateCategories>,
  InferCreationAttributes<StateCategories>
> {
  declare id: CreationOptional<number>;
  declare state_code: string | null;
  declare category_id: number | null;
}

StateCategories.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    state_code: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'state_code',
    },
    category_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'category_id',
    },
  },
  {
    sequelize,
    tableName: 'tbl_state_categories',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default StateCategories;
