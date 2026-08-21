/**
 * `tbl_visa_popup_content` — InnoDB, latin1.
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
export interface VisaPopupContentAttributes {
  id: number;
  content: string | null;
}

export class VisaPopupContent extends Model<
  InferAttributes<VisaPopupContent>,
  InferCreationAttributes<VisaPopupContent>
> {
  declare id: CreationOptional<number>;
  declare content: string | null;
}

VisaPopupContent.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'content',
    },
  },
  {
    sequelize,
    tableName: 'tbl_visa_popup_content',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default VisaPopupContent;
