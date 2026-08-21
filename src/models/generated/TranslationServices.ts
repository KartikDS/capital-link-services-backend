/**
 * `tbl_translation_services` — InnoDB, latin1.
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
export interface TranslationServicesAttributes {
  id: number;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  language_from: string | null;
  language_to: string | null;
  document_name: string | null;
  created: string;
  updated: string;
}

export class TranslationServices extends Model<
  InferAttributes<TranslationServices>,
  InferCreationAttributes<TranslationServices>
> {
  declare id: CreationOptional<number>;
  declare full_name: string | null;
  declare email: string | null;
  declare phone: string | null;
  declare language_from: string | null;
  declare language_to: string | null;
  declare document_name: string | null;
  declare created: string;
  declare updated: string;
}

TranslationServices.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    full_name: {
      type: DataTypes.STRING(225),
      allowNull: true,
      field: 'full_name',
    },
    email: {
      type: DataTypes.STRING(225),
      allowNull: true,
      field: 'email',
    },
    phone: {
      type: DataTypes.STRING(225),
      allowNull: true,
      field: 'phone',
    },
    language_from: {
      type: DataTypes.STRING(225),
      allowNull: true,
      field: 'language_from',
    },
    language_to: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'language_to',
    },
    document_name: {
      type: DataTypes.STRING(225),
      allowNull: true,
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
    tableName: 'tbl_translation_services',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default TranslationServices;
