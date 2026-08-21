/**
 * `tbl_russian_visa_voucher_types` — InnoDB, latin1.
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
export interface RussianVisaVoucherTypesAttributes {
  id: number;
  type: string | null;
  name: string | null;
  three_days_process_fee: number | null;
  one_two_days_process_fee: number | null;
  twelve_hrs_process_fee: number | null;
  thirteen_days: number | null;
  four_days: number | null;
  entry_option: string | null;
  s_active: number | null;
  type_order: string | null;
}

export class RussianVisaVoucherTypes extends Model<
  InferAttributes<RussianVisaVoucherTypes>,
  InferCreationAttributes<RussianVisaVoucherTypes>
> {
  declare id: CreationOptional<number>;
  declare type: string | null;
  declare name: string | null;
  declare three_days_process_fee: number | null;
  declare one_two_days_process_fee: number | null;
  declare twelve_hrs_process_fee: number | null;
  declare thirteen_days: number | null;
  declare four_days: number | null;
  declare entry_option: string | null;
  declare s_active: number | null;
  declare type_order: string | null;
}

RussianVisaVoucherTypes.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    type: {
      type: DataTypes.CHAR(225),
      allowNull: true,
      field: 'type',
    },
    name: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'name',
    },
    three_days_process_fee: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'three_days_process_fee',
    },
    one_two_days_process_fee: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'one_two_days_process_fee',
    },
    twelve_hrs_process_fee: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'twelve_hrs_process_fee',
    },
    thirteen_days: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'thirteen_days',
    },
    four_days: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'four_days',
    },
    entry_option: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'entry_option',
    },
    s_active: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 's_active',
    },
    type_order: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'type_order',
    },
  },
  {
    sequelize,
    tableName: 'tbl_russian_visa_voucher_types',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default RussianVisaVoucherTypes;
