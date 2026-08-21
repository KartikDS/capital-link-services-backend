/**
 * `tbl_categories` — InnoDB, latin1.
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
export interface CategoriesAttributes {
  id: number;
  country_id: number | null;
  visa_type_id: number | null;
  parent_id: number | null;
  entry_option: string | null;
  nationality: number | null;
  region: string | null;
  temp_category_id: number | null;
  is_process_location: number | null;
  location: string | null;
  category: string | null;
  description: string | null;
  status: number | null;
  created: string;
  modified: string;
}

export class Categories extends Model<
  InferAttributes<Categories>,
  InferCreationAttributes<Categories>
> {
  declare id: CreationOptional<number>;
  declare country_id: number | null;
  declare visa_type_id: number | null;
  declare parent_id: number | null;
  declare entry_option: string | null;
  declare nationality: number | null;
  declare region: string | null;
  declare temp_category_id: number | null;
  declare is_process_location: number | null;
  declare location: string | null;
  declare category: string | null;
  declare description: string | null;
  declare status: number | null;
  declare created: CreationOptional<string>;
  declare modified: CreationOptional<string>;
}

Categories.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    country_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'country_id',
    },
    visa_type_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'visa_type_id',
    },
    parent_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      field: 'parent_id',
    },
    entry_option: {
      type: DataTypes.STRING(11),
      allowNull: true,
      field: 'entry_option',
    },
    nationality: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'nationality',
    },
    region: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'region',
    },
    temp_category_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'temp_category_id',
    },
    is_process_location: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'is_process_location',
    },
    location: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'location',
    },
    category: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'category',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'description',
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'status',
    },
    created: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created',
    },
    modified: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'modified',
    },
  },
  {
    sequelize,
    tableName: 'tbl_categories',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default Categories;
