/**
 * `tbl_tpn` — MyISAM, latin1.
 *
 * Generated from db/schema/clspubli_staging.sql by scripts/generateModels.ts.
 * Do not edit: re-run `npm run models:generate` if CLS supplies a new dump.
 */
import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../../config/database';

/** Every column, as it is read back. Use this in presenters. */
export interface TpnAttributes {
  tpn_no: string;
  date_submitted: string | null;
  date_last_updated: string | null;
  date_issued: string | null;
  order_no: number | null;
  client_id: number | null;
  tpn_src: string | null;
  tpn_src_previous: string | null;
  tpn_src_original_approved: string | null;
  destination: number | null;
  departure_date: string | null;
  entry_option: number | null;
  entry_date_country: string | null;
  departure_date_country: string | null;
  travel_purpose: string | null;
  is_seen: number | null;
  /** 0=pending; 1=approved; 2=rejected */
  status: number | null;
}

export class Tpn extends Model<
  InferAttributes<Tpn>,
  InferCreationAttributes<Tpn>
> {
  declare tpn_no: string;
  declare date_submitted: string | null;
  declare date_last_updated: string | null;
  declare date_issued: string | null;
  declare order_no: number | null;
  declare client_id: number | null;
  declare tpn_src: string | null;
  declare tpn_src_previous: string | null;
  declare tpn_src_original_approved: string | null;
  declare destination: number | null;
  declare departure_date: string | null;
  declare entry_option: number | null;
  declare entry_date_country: string | null;
  declare departure_date_country: string | null;
  declare travel_purpose: string | null;
  declare is_seen: number | null;
  declare status: number | null;
}

Tpn.init(
  {
    tpn_no: {
      type: DataTypes.CHAR(12),
      allowNull: false,
      primaryKey: true,
      field: 'tpn_no',
    },
    date_submitted: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'date_submitted',
    },
    date_last_updated: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'date_last_updated',
    },
    date_issued: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'date_issued',
    },
    order_no: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'order_no',
    },
    client_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'client_id',
    },
    tpn_src: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      field: 'tpn_src',
    },
    tpn_src_previous: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      field: 'tpn_src_previous',
    },
    tpn_src_original_approved: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      field: 'tpn_src_original_approved',
    },
    destination: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'destination',
    },
    departure_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'departure_date',
    },
    entry_option: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'entry_option',
    },
    entry_date_country: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'entry_date_country',
    },
    departure_date_country: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'departure_date_country',
    },
    travel_purpose: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      field: 'travel_purpose',
    },
    is_seen: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'is_seen',
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'status',
    },
  },
  {
    sequelize,
    tableName: 'tbl_tpn',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default Tpn;
