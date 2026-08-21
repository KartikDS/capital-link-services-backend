/**
 * `tbl_free_visa_document` — InnoDB, latin1.
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
export interface FreeVisaDocumentAttributes {
  id: number;
  country_id: number;
  visa_type: number;
  client_id: number;
  document_name: string;
  created: string;
  updated: string;
}

export class FreeVisaDocument extends Model<
  InferAttributes<FreeVisaDocument>,
  InferCreationAttributes<FreeVisaDocument>
> {
  declare id: CreationOptional<number>;
  declare country_id: number;
  declare visa_type: number;
  declare client_id: number;
  declare document_name: string;
  declare created: string;
  declare updated: string;
}

FreeVisaDocument.init(
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
      allowNull: false,
      field: 'country_id',
    },
    visa_type: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'visa_type',
    },
    client_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'client_id',
    },
    document_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'document_name',
    },
    created: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created',
    },
    updated: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'updated',
    },
  },
  {
    sequelize,
    tableName: 'tbl_free_visa_document',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default FreeVisaDocument;
