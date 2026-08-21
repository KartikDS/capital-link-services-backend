/**
 * `tbl_banners` — InnoDB, latin1.
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
export interface BannersAttributes {
  id: number;
  title: string;
  sub_title: string;
  banner_image: string;
  location: string;
  status: number;
  created: string;
  updated: string;
}

export class Banners extends Model<
  InferAttributes<Banners>,
  InferCreationAttributes<Banners>
> {
  declare id: CreationOptional<number>;
  declare title: string;
  declare sub_title: string;
  declare banner_image: string;
  declare location: string;
  declare status: number;
  declare created: string;
  declare updated: string;
}

Banners.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'title',
    },
    sub_title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'sub_title',
    },
    banner_image: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'banner_image',
    },
    location: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'location',
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'status',
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
    tableName: 'tbl_banners',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default Banners;
