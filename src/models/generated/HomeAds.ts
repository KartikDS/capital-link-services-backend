/**
 * `tbl_home_ads` — MyISAM, latin1.
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
export interface HomeAdsAttributes {
  id: number;
  image: string | null;
  link: string | null;
  s_enabled: number | null;
}

export class HomeAds extends Model<
  InferAttributes<HomeAds>,
  InferCreationAttributes<HomeAds>
> {
  declare id: CreationOptional<number>;
  declare image: string | null;
  declare link: string | null;
  declare s_enabled: number | null;
}

HomeAds.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    image: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'image',
    },
    link: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'link',
    },
    s_enabled: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 's_enabled',
    },
  },
  {
    sequelize,
    tableName: 'tbl_home_ads',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default HomeAds;
