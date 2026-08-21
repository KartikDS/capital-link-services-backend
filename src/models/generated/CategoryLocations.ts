/**
 * `tbl_category_locations` — InnoDB, latin1.
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
export interface CategoryLocationsAttributes {
  id: number;
  category_id: number | null;
  location_id: number | null;
}

export class CategoryLocations extends Model<
  InferAttributes<CategoryLocations>,
  InferCreationAttributes<CategoryLocations>
> {
  declare id: CreationOptional<number>;
  declare category_id: number | null;
  declare location_id: number | null;
}

CategoryLocations.init(
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
    location_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'location_id',
    },
  },
  {
    sequelize,
    tableName: 'tbl_category_locations',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default CategoryLocations;
