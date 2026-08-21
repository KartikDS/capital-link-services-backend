/**
 * `tbl_document_legalization_documents` — InnoDB, latin1.
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
export interface DocumentLegalizationDocumentsAttributes {
  id: number;
  order_id: number | null;
  document_type: string | null;
  number: number | null;
  note: string | null;
  document_file: string | null;
  status: number | null;
}

export class DocumentLegalizationDocuments extends Model<
  InferAttributes<DocumentLegalizationDocuments>,
  InferCreationAttributes<DocumentLegalizationDocuments>
> {
  declare id: CreationOptional<number>;
  declare order_id: number | null;
  declare document_type: string | null;
  declare number: number | null;
  declare note: string | null;
  declare document_file: string | null;
  declare status: number | null;
}

DocumentLegalizationDocuments.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    order_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'order_id',
    },
    document_type: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'document_type',
    },
    number: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'number',
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'note',
    },
    document_file: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'document_file',
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'status',
    },
  },
  {
    sequelize,
    tableName: 'tbl_document_legalization_documents',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default DocumentLegalizationDocuments;
