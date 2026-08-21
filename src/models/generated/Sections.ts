/**
 * `tbl_sections` — InnoDB, latin1.
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
export interface SectionsAttributes {
  id: number;
  section_key: string | null;
  title: string | null;
  content: string | null;
  image: string | null;
  page_slug: string | null;
  status: string | null;
}

export class Sections extends Model<
  InferAttributes<Sections>,
  InferCreationAttributes<Sections>
> {
  declare id: CreationOptional<number>;
  declare section_key: string | null;
  declare title: string | null;
  declare content: string | null;
  declare image: string | null;
  declare page_slug: string | null;
  declare status: string | null;
}

Sections.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    section_key: {
      type: DataTypes.CHAR(255),
      allowNull: true,
      field: 'section_key',
    },
    title: {
      type: DataTypes.CHAR(255),
      allowNull: true,
      field: 'title',
    },
    content: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      field: 'content',
    },
    image: {
      type: DataTypes.CHAR(255),
      allowNull: true,
      field: 'image',
    },
    page_slug: {
      type: DataTypes.CHAR(255),
      allowNull: true,
      field: 'page_slug',
    },
    status: {
      type: DataTypes.CHAR(20),
      allowNull: true,
      defaultValue: 'active',
      field: 'status',
    },
  },
  {
    sequelize,
    tableName: 'tbl_sections',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default Sections;
