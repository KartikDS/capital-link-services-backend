/**
 * `tbl_category_nationalities` — InnoDB, latin1.
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
export interface CategoryNationalitiesAttributes {
  id: number;
  category_id: number | null;
  nationality_id: number | null;
}

export class CategoryNationalities extends Model<
  InferAttributes<CategoryNationalities>,
  InferCreationAttributes<CategoryNationalities>
> {
  declare id: CreationOptional<number>;
  declare category_id: number | null;
  declare nationality_id: number | null;
}

CategoryNationalities.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    category_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'category_id',
    },
    nationality_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'nationality_id',
    },
  },
  {
    sequelize,
    tableName: 'tbl_category_nationalities',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default CategoryNationalities;
