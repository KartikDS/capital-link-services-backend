/**
 * `tbl_category_documents` — InnoDB, latin1.
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
export interface CategoryDocumentsAttributes {
  id: number;
  category_id: number | null;
  subcategory_id: number | null;
  doc_id: number | null;
  status: number | null;
}

export class CategoryDocuments extends Model<
  InferAttributes<CategoryDocuments>,
  InferCreationAttributes<CategoryDocuments>
> {
  declare id: CreationOptional<number>;
  declare category_id: number | null;
  declare subcategory_id: number | null;
  declare doc_id: number | null;
  declare status: number | null;
}

CategoryDocuments.init(
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
    subcategory_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'subcategory_id',
    },
    doc_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'doc_id',
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'status',
    },
  },
  {
    sequelize,
    tableName: 'tbl_category_documents',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default CategoryDocuments;
