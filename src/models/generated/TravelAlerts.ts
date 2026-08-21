/**
 * `tbl_travel_alerts` — InnoDB, latin1.
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
export interface TravelAlertsAttributes {
  id: number;
  alert_date: string | null;
  subject: string | null;
  featured_image: string | null;
  body: string | null;
  admin_id: number | null;
  status: string | null;
}

export class TravelAlerts extends Model<
  InferAttributes<TravelAlerts>,
  InferCreationAttributes<TravelAlerts>
> {
  declare id: CreationOptional<number>;
  declare alert_date: string | null;
  declare subject: string | null;
  declare featured_image: string | null;
  declare body: string | null;
  declare admin_id: number | null;
  declare status: string | null;
}

TravelAlerts.init(
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    alert_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'alert_date',
    },
    subject: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'subject',
    },
    featured_image: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'featured_image',
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'body',
    },
    admin_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'admin_id',
    },
    status: {
      type: DataTypes.CHAR(10),
      allowNull: true,
      field: 'status',
    },
  },
  {
    sequelize,
    tableName: 'tbl_travel_alerts',
    // The name is exact and must never be pluralised or snake-cased by the ORM.
    freezeTableName: true,
    // This schema has no consistent timestamp convention, so Sequelize manages
    // none of them; the columns above are whatever the table actually has.
    timestamps: false,
  }
);

export default TravelAlerts;
