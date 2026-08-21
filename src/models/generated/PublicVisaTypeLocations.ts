/**
 * `tbl_public_visa_type_locations` — InnoDB, latin1.
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
export interface PublicVisaTypeLocationsAttributes {
  id: number;
  visa_type_id: number | null;
  location: string | null;
  location_group: number | null;
}

export class PublicVisaTypeLocations extends Model<
  InferAttributes<PublicVisaTypeLocations>,
  InferCreationAttributes<PublicVisaTypeLocations>
> {
  declare id: CreationOptional<number>;
  declare visa_type_id: number | null;
  declare location: string | null;
  declare location_group: number | null;
}

PublicVisaTypeLocations.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    visa_type_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'visa_type_id',
    },
    location: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'location',
    },
    location_group: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'location_group',
    },
  },
  {
    sequelize,
    tableName: 'tbl_public_visa_type_locations',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default PublicVisaTypeLocations;
