/**
 * `tbl_order_passport_applicants` — MyISAM, latin1.
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
export interface OrderPassportApplicantsAttributes {
  id: number;
  order_no: number | null;
  fullname: string | null;
  personal_passport: number | null;
  diplomatic_official_passport: number | null;
  birth_certificate: number | null;
  marriage_certificate: number | null;
  certificate_of_australian_citizenship: number | null;
}

export class OrderPassportApplicants extends Model<
  InferAttributes<OrderPassportApplicants>,
  InferCreationAttributes<OrderPassportApplicants>
> {
  declare id: CreationOptional<number>;
  declare order_no: number | null;
  declare fullname: string | null;
  declare personal_passport: number | null;
  declare diplomatic_official_passport: number | null;
  declare birth_certificate: number | null;
  declare marriage_certificate: number | null;
  declare certificate_of_australian_citizenship: number | null;
}

OrderPassportApplicants.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    order_no: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'order_no',
    },
    fullname: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'fullname',
    },
    personal_passport: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'personal_passport',
    },
    diplomatic_official_passport: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'diplomatic_official_passport',
    },
    birth_certificate: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'birth_certificate',
    },
    marriage_certificate: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'marriage_certificate',
    },
    certificate_of_australian_citizenship: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'certificate_of_australian_citizenship',
    },
  },
  {
    sequelize,
    tableName: 'tbl_order_passport_applicants',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default OrderPassportApplicants;
