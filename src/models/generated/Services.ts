/**
 * `tbl_services` — InnoDB, latin1.
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
export interface ServicesAttributes {
  id: number;
  parent_id: number | null;
  title: string | null;
  sub_title: string | null;
  short_description: string | null;
  image: string | null;
  charges: string | null;
  status: number | null;
}

export class Services extends Model<
  InferAttributes<Services>,
  InferCreationAttributes<Services>
> {
  declare id: CreationOptional<number>;
  declare parent_id: number | null;
  declare title: string | null;
  declare sub_title: string | null;
  declare short_description: string | null;
  declare image: string | null;
  declare charges: string | null;
  declare status: number | null;
}

Services.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    parent_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'parent_id',
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'title',
    },
    sub_title: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'sub_title',
    },
    short_description: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'short_description',
    },
    image: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'image',
    },
    charges: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'charges',
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'status',
    },
  },
  {
    sequelize,
    tableName: 'tbl_services',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default Services;
