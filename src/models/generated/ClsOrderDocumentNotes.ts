/**
 * `tbl_cls_order_document_notes` — InnoDB, latin1.
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
export interface ClsOrderDocumentNotesAttributes {
  id: number;
  order_id: number | null;
  document_id: number | null;
  order_document_id: number | null;
  notes: string | null;
  is_approved: number | null;
  created: string | null;
  modified: string | null;
}

export class ClsOrderDocumentNotes extends Model<
  InferAttributes<ClsOrderDocumentNotes>,
  InferCreationAttributes<ClsOrderDocumentNotes>
> {
  declare id: CreationOptional<number>;
  declare order_id: number | null;
  declare document_id: number | null;
  declare order_document_id: number | null;
  declare notes: string | null;
  declare is_approved: number | null;
  declare created: string | null;
  declare modified: string | null;
}

ClsOrderDocumentNotes.init(
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
    document_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'document_id',
    },
    order_document_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'order_document_id',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'notes',
    },
    is_approved: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      field: 'is_approved',
    },
    created: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
      field: 'created',
    },
    modified: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
      field: 'modified',
    },
  },
  {
    sequelize,
    tableName: 'tbl_cls_order_document_notes',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default ClsOrderDocumentNotes;
