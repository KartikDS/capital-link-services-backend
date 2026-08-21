/**
 * `tbl_public_visa_drop_down` — InnoDB, latin1.
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
export interface PublicVisaDropDownAttributes {
  id: number;
  visa_id: number | null;
  visa_label: string | null;
  visa_information: string | null;
  status: number | null;
}

export class PublicVisaDropDown extends Model<
  InferAttributes<PublicVisaDropDown>,
  InferCreationAttributes<PublicVisaDropDown>
> {
  declare id: CreationOptional<number>;
  declare visa_id: number | null;
  declare visa_label: string | null;
  declare visa_information: string | null;
  declare status: number | null;
}

PublicVisaDropDown.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    visa_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'visa_id',
    },
    visa_label: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'visa_label',
    },
    visa_information: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      field: 'visa_information',
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'status',
    },
  },
  {
    sequelize,
    tableName: 'tbl_public_visa_drop_down',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default PublicVisaDropDown;
