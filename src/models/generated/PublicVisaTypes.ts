/**
 * `tbl_public_visa_types` — MyISAM, latin1.
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
export interface PublicVisaTypesAttributes {
  id: number;
  country_id: number | null;
  type: string | null;
  cost: number | null;
  title: string | null;
  description: string | null;
  file_attachment: string | null;
  second_file_attachment: string | null;
  bulk_document_pack_attachment: string | null;
  status: number | null;
  is_process_location: number | null;
  visa_information: string | null;
  processing_time: string | null;
  visa_label: string | null;
}

export class PublicVisaTypes extends Model<
  InferAttributes<PublicVisaTypes>,
  InferCreationAttributes<PublicVisaTypes>
> {
  declare id: CreationOptional<number>;
  declare country_id: number | null;
  declare type: string | null;
  declare cost: number | null;
  declare title: string | null;
  declare description: string | null;
  declare file_attachment: string | null;
  declare second_file_attachment: string | null;
  declare bulk_document_pack_attachment: string | null;
  declare status: number | null;
  declare is_process_location: number | null;
  declare visa_information: string | null;
  declare processing_time: string | null;
  declare visa_label: string | null;
}

PublicVisaTypes.init(
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
    type: {
      type: DataTypes.CHAR(100),
      allowNull: true,
      field: 'type',
    },
    cost: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'cost',
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'title',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'description',
    },
    file_attachment: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'file_attachment',
    },
    second_file_attachment: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'second_file_attachment',
    },
    bulk_document_pack_attachment: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'bulk_document_pack_attachment',
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'status',
    },
    is_process_location: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'is_process_location',
    },
    visa_information: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      field: 'visa_information',
    },
    processing_time: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'processing_time',
    },
    visa_label: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'visa_label',
    },
  },
  {
    sequelize,
    tableName: 'tbl_public_visa_types',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default PublicVisaTypes;
