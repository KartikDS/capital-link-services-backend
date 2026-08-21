/**
 * `tbl_documents` — InnoDB, latin1.
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
export interface DocumentsAttributes {
  id: number;
  country_id: number | null;
  visa_type_id: number | null;
  entry_option: string | null;
  nationality: number | null;
  category_id: number | null;
  document_name: string | null;
  description: string | null;
  is_sample: number | null;
  sample_doc: string | null;
  document: string | null;
  status: number | null;
  created: string;
  modified: string;
}

export class Documents extends Model<
  InferAttributes<Documents>,
  InferCreationAttributes<Documents>
> {
  declare id: CreationOptional<number>;
  declare country_id: number | null;
  declare visa_type_id: number | null;
  declare entry_option: string | null;
  declare nationality: number | null;
  declare category_id: number | null;
  declare document_name: string | null;
  declare description: string | null;
  declare is_sample: number | null;
  declare sample_doc: string | null;
  declare document: string | null;
  declare status: number | null;
  declare created: CreationOptional<string>;
  declare modified: CreationOptional<string>;
}

Documents.init(
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
    entry_option: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'entry_option',
    },
    nationality: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'nationality',
    },
    category_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'category_id',
    },
    document_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'document_name',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'description',
    },
    is_sample: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'is_sample',
    },
    sample_doc: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'sample_doc',
    },
    document: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'document',
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
    tableName: 'tbl_documents',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default Documents;
