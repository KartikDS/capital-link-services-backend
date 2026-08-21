/**
 * `tbl_content_pages` — MyISAM, latin1.
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
export interface ContentPagesAttributes {
  id: number;
  title: string | null;
  html: string | null;
  tags: string | null;
  status: string;
}

export class ContentPages extends Model<
  InferAttributes<ContentPages>,
  InferCreationAttributes<ContentPages>
> {
  declare id: CreationOptional<number>;
  declare title: string | null;
  declare html: string | null;
  declare tags: string | null;
  declare status: string;
}

ContentPages.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    title: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'title',
    },
    html: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      field: 'html',
    },
    tags: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'tags',
    },
    status: {
      type: DataTypes.CHAR(100),
      allowNull: false,
      field: 'status',
    },
  },
  {
    sequelize,
    tableName: 'tbl_content_pages',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default ContentPages;
