/**
 * `tbl_cls_order_documents` — InnoDB, latin1.
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
export interface ClsOrderDocumentsAttributes {
  id: number;
  order_id: number | null;
  country_id: number | null;
  visa_type_id: number | null;
  entry_option: number | null;
  process_location_id: number | null;
  nationality: number | null;
  region: string | null;
  category_id: number | null;
  document_id: number | null;
  traveller_id: number | null;
  document: string | null;
  /** 0=unattended;1=uploaded;2=reviewed;3=rejected;4=approved */
  status: number | null;
  created: string;
  modified: string;
}

export class ClsOrderDocuments extends Model<
  InferAttributes<ClsOrderDocuments>,
  InferCreationAttributes<ClsOrderDocuments>
> {
  declare id: CreationOptional<number>;
  declare order_id: number | null;
  declare country_id: number | null;
  declare visa_type_id: number | null;
  declare entry_option: number | null;
  declare process_location_id: number | null;
  declare nationality: number | null;
  declare region: string | null;
  declare category_id: number | null;
  declare document_id: number | null;
  declare traveller_id: number | null;
  declare document: string | null;
  declare status: number | null;
  declare created: CreationOptional<string>;
  declare modified: CreationOptional<string>;
}

ClsOrderDocuments.init(
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
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'entry_option',
    },
    process_location_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'process_location_id',
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
    category_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'category_id',
    },
    document_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'document_id',
    },
    traveller_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'traveller_id',
    },
    document: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'document',
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
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
    tableName: 'tbl_cls_order_documents',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default ClsOrderDocuments;
