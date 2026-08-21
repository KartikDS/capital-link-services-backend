/**
 * `tbl_doc_legalization_attachments` — InnoDB, latin1.
 *
 * Generated from db/schema/clspubli_staging.sql by scripts/generateModels.ts.
 * Do not edit: re-run `npm run models:generate` if CLS supplies a new dump.
 */
import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../../config/database';

/** Every column, as it is read back. Use this in presenters. */
export interface DocLegalizationAttachmentsAttributes {
  id: number;
  attachment_file: string | null;
}

export class DocLegalizationAttachments extends Model<
  InferAttributes<DocLegalizationAttachments>,
  InferCreationAttributes<DocLegalizationAttachments>
> {
  declare id: number;
  declare attachment_file: string | null;
}

DocLegalizationAttachments.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      field: 'id',
    },
    attachment_file: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'attachment_file',
    },
  },
  {
    sequelize,
    tableName: 'tbl_doc_legalization_attachments',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default DocLegalizationAttachments;
