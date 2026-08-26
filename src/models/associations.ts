import type { Model, ModelStatic } from 'sequelize';
import { generatedModels as M } from './generated';

/**
 * Every relationship in the CLS database, declared by hand.
 *
 * The schema has **no foreign keys** — not one, across ninety-four tables. Five
 * years of referential integrity has been enforced by the old application, so
 * every association below is a claim about intent read off column names and the
 * dump's own comments, not something the database will confirm.
 *
 * Three consequences shape all of this:
 *
 * 1. **Orphans are expected.** A destination whose order was deleted, an order
 *    whose client row is gone. Reads use `LEFT` joins (`required: false`) so a
 *    missing parent renders as a gap rather than dropping the row.
 * 2. **`constraints: false` everywhere.** Sequelize would otherwise try to add
 *    the foreign keys the schema deliberately lacks, which is DDL, which this
 *    application never issues.
 * 3. **Nothing cascades.** No `onDelete`, no `onUpdate`. A cascade here would be
 *    this application deciding to delete legacy rows the old one still reads.
 *
 * ## The two order families
 *
 * The database holds two generations of order model, both live:
 *
 * - **`tbl_orders`** — the original. Primary key `order_no` (an integer), and
 *   one very wide row per order: 145 columns covering visa, TPN, passport
 *   delivery, police clearance, document delivery, Russian voucher and document
 *   legalisation all in the same record. Satellites join on `order_no`.
 *
 * - **`tbl_cls_order`** — the newer one. Primary key `id`, with the per-service
 *   detail split into `*_order_details` tables and a TEXT `order_no` holding the
 *   printed reference. Satellites join on `order_id`.
 *
 * Which one CLS currently writes is unconfirmed, so both are mapped and the
 * order service reads `tbl_cls_order` first and falls back to `tbl_orders`.
 * When CLS confirms, the loser gets marked read-only here rather than deleted —
 * its rows still have to be answerable for.
 */

/** Shared by every association: no DDL, no cascade, no assumption of a parent. */
const LOOSE = { constraints: false } as const;

/** Any model, for the loops below. */
type AnyModel = ModelStatic<Model>;

/**
 * Links a parent to many children on a shared column, both ways.
 *
 * A helper because the two order families have fifteen and eight satellite
 * tables respectively, all joined the same way, and writing forty-six
 * `hasMany`/`belongsTo` pairs out longhand buries the handful of associations
 * that are actually interesting.
 *
 * The signature is widened to `ModelStatic<Model>` on purpose. Sequelize's types
 * bind an association to one concrete model, so a loop over a list of different
 * models cannot satisfy them — and the alternative is the longhand. The runtime
 * behaviour is identical either way; what is lost is a compile-time check that
 * the alias does not already exist, which `applyAssociations` running once
 * covers instead.
 */
const linkChildren = (
  parent: AnyModel,
  children: readonly (readonly [AnyModel, string])[],
  options: {
    /** Column on the child holding the parent's key. */
    foreignKey: string;
    /** Column on the parent it points at. */
    sourceKey: string;
    /** Alias the child uses for its parent. */
    parentAs: string;
  }
): void => {
  for (const [child, alias] of children) {
    parent.hasMany(child, {
      foreignKey: options.foreignKey,
      sourceKey: options.sourceKey,
      as: alias,
      ...LOOSE,
    });

    child.belongsTo(parent, {
      foreignKey: options.foreignKey,
      targetKey: options.sourceKey,
      as: options.parentAs,
      ...LOOSE,
    });
  }
};

let applied = false;

export const applyAssociations = (): void => {
  // Sequelize throws on a duplicate association name, and the model registry is
  // imported by tests as well as the server.
  if (applied) return;
  applied = true;

  // -------------------------------------------------------------------------
  // Accounts
  // -------------------------------------------------------------------------

  // `tbl_user_client.department_id` is the one relationship the dump actually
  // indexes (`ADD KEY department_id`), which is as close to a declared intent
  // as this schema gets.
  M.UserClient.belongsTo(M.Departments, {
    foreignKey: 'department_id',
    targetKey: 'id',
    as: 'department',
    ...LOOSE,
  });

  M.UserClient.belongsTo(M.Countries, {
    foreignKey: 'country_id',
    targetKey: 'id',
    as: 'country',
    ...LOOSE,
  });

  // -------------------------------------------------------------------------
  // The newer order family: tbl_cls_order + `order_id` satellites
  // -------------------------------------------------------------------------

  M.ClsOrder.belongsTo(M.UserClient, {
    foreignKey: 'client_id',
    targetKey: 'id',
    as: 'client',
    ...LOOSE,
  });

  // `destination` carries a country id — the dump says so in a column comment.
  M.ClsOrder.belongsTo(M.Countries, {
    foreignKey: 'destination',
    targetKey: 'id',
    as: 'destinationCountry',
    ...LOOSE,
  });

  linkChildren(
    M.ClsOrder,
    [
      [M.ClsOrderDestinations, 'destinations'],
      [M.ClsOrderDocuments, 'documents'],
      [M.ClsOrderDocumentNotes, 'documentNotes'],
      [M.ClsTpnOrderDetails, 'tpnDetails'],
      [M.PoliceClearanceOrderDetails, 'policeClearanceDetails'],
      [M.RussianVisaVoucherOrderDetails, 'voucherDetails'],
      [M.DocumentLegalizationOrderDetails, 'legalisationDetails'],
      [M.DocumentLegalizationDocuments, 'legalisationDocuments'],
      [M.OrderTravellerDetails, 'travellers'],
      [M.OrderAdditionalServices, 'additionalServices'],
      [M.OrderCourierServiceDetails, 'courierDetails'],
      [M.OrderDocDeliveryDetails, 'docDeliveryDetails'],
      [M.OrderReturnDocumentDetails, 'returnDocumentDetails'],
      [M.OrderFollowUpDate, 'followUps'],
      [M.SaudiInvitationLetters, 'saudiInvitations'],
    ],
    { foreignKey: 'order_id', sourceKey: 'id', parentAs: 'order' }
  );

  M.ClsOrderDestinations.belongsTo(M.Countries, {
    foreignKey: 'country_id',
    targetKey: 'id',
    as: 'country',
    ...LOOSE,
  });

  M.ClsOrderDocuments.belongsTo(M.Documents, {
    foreignKey: 'document_id',
    targetKey: 'id',
    as: 'documentType',
    ...LOOSE,
  });

  // -------------------------------------------------------------------------
  // The original order family: tbl_orders + `order_no` satellites
  // -------------------------------------------------------------------------

  M.Orders.belongsTo(M.UserClient, {
    foreignKey: 'client_id',
    targetKey: 'id',
    as: 'client',
    ...LOOSE,
  });

  M.Orders.belongsTo(M.Countries, {
    foreignKey: 'destination',
    targetKey: 'id',
    as: 'destinationCountry',
    ...LOOSE,
  });

  linkChildren(
    M.Orders,
    [
      [M.OrderDestinations, 'destinations'],
      [M.OrderTravellers, 'travellers'],
      [M.OrderNotes, 'notes'],
      [M.OrderDlChecklist, 'legalisationChecklist'],
      [M.OrderDlQuotes, 'legalisationQuotes'],
      [M.OrderPassportApplicants, 'passportApplicants'],
      [M.OrderPoliceClearanceApplicants, 'clearanceApplicants'],
      [M.ScanGroup, 'scanGroups'],
    ],
    { foreignKey: 'order_no', sourceKey: 'order_no', parentAs: 'order' }
  );

  M.OrderTravellers.belongsTo(M.NameTitle, {
    foreignKey: 'title',
    targetKey: 'id',
    as: 'nameTitle',
    ...LOOSE,
  });

  M.OrderTravellers.belongsTo(M.PassportTypes, {
    foreignKey: 'passport_type',
    targetKey: 'id',
    as: 'passportType',
    ...LOOSE,
  });

  M.OrderTravellers.belongsTo(M.Countries, {
    foreignKey: 'nationality',
    targetKey: 'id',
    as: 'nationalityCountry',
    ...LOOSE,
  });

  M.OrderDestinations.belongsTo(M.Countries, {
    foreignKey: 'country_id',
    targetKey: 'id',
    as: 'country',
    ...LOOSE,
  });

  // `tbl_order_destination_notes.destination_id` points at a destination row in
  // either family — the column name does not say which, and the note tables are
  // MyISAM so nothing constrained it. Both are mapped, because CLS's admin
  // genuinely annotates both: `GlobalController.getDestinationNotesByDestId` is
  // called with a `tbl_cls_order_destinations` id from the current
  // `getClsOrderDestinationsByOrderNo`, and with a `tbl_order_destinations` id
  // from the older `getOrderDestinationsByOrderNo` — and the admin's edit and
  // delete actions resolve a note's `destination_id` in whichever holds it.
  //
  // The CLS mapping is the one that matters for anything this API lodges: every
  // order it writes is a `tbl_cls_order` with a `tbl_cls_order_destinations`
  // row, so that is where the consultant thread on a new order hangs.
  M.ClsOrderDestinations.hasMany(M.OrderDestinationNotes, {
    foreignKey: 'destination_id',
    sourceKey: 'id',
    as: 'notes',
    ...LOOSE,
  });

  M.OrderDestinations.hasMany(M.OrderDestinationNotes, {
    foreignKey: 'destination_id',
    sourceKey: 'id',
    as: 'notes',
    ...LOOSE,
  });

  // -------------------------------------------------------------------------
  // Payments
  // -------------------------------------------------------------------------

  // `tbl_payment.order_no` is an int, so it joins the legacy family's key.
  // Payments against a `tbl_cls_order` are matched on its TEXT `order_no` in
  // the payment service instead, because the types do not line up for a join.
  M.Payment.belongsTo(M.Orders, {
    foreignKey: 'order_no',
    targetKey: 'order_no',
    as: 'order',
    ...LOOSE,
  });

  M.Payment.belongsTo(M.UserClient, {
    foreignKey: 'client_id',
    targetKey: 'id',
    as: 'client',
    ...LOOSE,
  });

  M.Payment.belongsTo(M.CardTypes, {
    foreignKey: 'card_type',
    targetKey: 'id',
    as: 'cardType',
    ...LOOSE,
  });

  // -------------------------------------------------------------------------
  // Visa catalogue
  // -------------------------------------------------------------------------

  M.Countries.hasMany(M.VisaTypes, {
    foreignKey: 'country_id',
    sourceKey: 'id',
    as: 'visaTypes',
    ...LOOSE,
  });

  M.Countries.hasMany(M.PublicVisaTypes, {
    foreignKey: 'country_id',
    sourceKey: 'id',
    as: 'publicVisaTypes',
    ...LOOSE,
  });

  M.Countries.hasMany(M.Categories, {
    foreignKey: 'country_id',
    sourceKey: 'id',
    as: 'categories',
    ...LOOSE,
  });

  M.Countries.hasMany(M.States, {
    foreignKey: 'country_id',
    sourceKey: 'id',
    as: 'states',
    ...LOOSE,
  });

  M.VisaTypes.belongsTo(M.Countries, {
    foreignKey: 'country_id',
    targetKey: 'id',
    as: 'country',
    ...LOOSE,
  });

  M.PublicVisaTypes.belongsTo(M.Countries, {
    foreignKey: 'country_id',
    targetKey: 'id',
    as: 'country',
    ...LOOSE,
  });

  // `visa_id` on the requirement tables points at a *visa type*, despite the
  // name. Both a public and a government requirement table exist with the same
  // shape, which is why they are separate tables rather than one with a flag.
  M.PublicVisaTypes.hasMany(M.PublicVisaAdditionalRequirements, {
    foreignKey: 'visa_id',
    sourceKey: 'id',
    as: 'additionalRequirements',
    ...LOOSE,
  });

  M.VisaTypes.hasMany(M.VisaAdditionalRequirements, {
    foreignKey: 'visa_id',
    sourceKey: 'id',
    as: 'additionalRequirements',
    ...LOOSE,
  });

  M.PublicVisaTypes.hasMany(M.PublicVisaTypeLocations, {
    foreignKey: 'visa_type_id',
    sourceKey: 'id',
    as: 'locations',
    ...LOOSE,
  });

  M.PublicVisaTypes.hasMany(M.PublicVisaDropDown, {
    foreignKey: 'visa_id',
    sourceKey: 'id',
    as: 'dropDown',
    ...LOOSE,
  });

  M.PublicVisaTypes.hasMany(M.AdditionalServices, {
    foreignKey: 'visa_id',
    sourceKey: 'id',
    as: 'additionalServices',
    ...LOOSE,
  });

  // -------------------------------------------------------------------------
  // Document requirements
  // -------------------------------------------------------------------------

  M.Categories.hasMany(M.CategoryDocuments, {
    foreignKey: 'category_id',
    sourceKey: 'id',
    as: 'categoryDocuments',
    ...LOOSE,
  });

  M.CategoryDocuments.belongsTo(M.Documents, {
    foreignKey: 'doc_id',
    targetKey: 'id',
    as: 'document',
    ...LOOSE,
  });

  M.Categories.hasMany(M.CategoryLocations, {
    foreignKey: 'category_id',
    sourceKey: 'id',
    as: 'categoryLocations',
    ...LOOSE,
  });

  M.CategoryLocations.belongsTo(M.Locations, {
    foreignKey: 'location_id',
    targetKey: 'id',
    as: 'location',
    ...LOOSE,
  });

  M.Categories.hasMany(M.CategoryNationalities, {
    foreignKey: 'category_id',
    sourceKey: 'id',
    as: 'categoryNationalities',
    ...LOOSE,
  });

  M.CategoryNationalities.belongsTo(M.Countries, {
    foreignKey: 'nationality_id',
    targetKey: 'id',
    as: 'nationality',
    ...LOOSE,
  });

  M.Documents.belongsTo(M.Countries, {
    foreignKey: 'country_id',
    targetKey: 'id',
    as: 'country',
    ...LOOSE,
  });

  // -------------------------------------------------------------------------
  // Per-service detail → its own catalogue row
  // -------------------------------------------------------------------------

  M.PoliceClearanceOrderDetails.belongsTo(M.PoliceClearances, {
    foreignKey: 'police_clearance_id',
    targetKey: 'id',
    as: 'clearance',
    ...LOOSE,
  });

  M.RussianVisaVoucherOrderDetails.belongsTo(M.RussianVisaVoucherTypes, {
    foreignKey: 'russian_visa_voucher_id',
    targetKey: 'id',
    as: 'voucherType',
    ...LOOSE,
  });

  M.OrderAdditionalServices.belongsTo(M.AdditionalServices, {
    foreignKey: 'additional_service_id',
    targetKey: 'id',
    as: 'service',
    ...LOOSE,
  });

  M.OrderCourierServiceDetails.belongsTo(M.VisaCourierOptions, {
    foreignKey: 'courier_service_id',
    targetKey: 'id',
    as: 'courierOption',
    ...LOOSE,
  });

  M.OrderTravellerDetails.belongsTo(M.Countries, {
    foreignKey: 'nationality',
    targetKey: 'id',
    as: 'nationalityCountry',
    ...LOOSE,
  });

  M.OrderTravellerDetails.belongsTo(M.PassportTypes, {
    foreignKey: 'passport_type',
    targetKey: 'id',
    as: 'passportType',
    ...LOOSE,
  });

  // -------------------------------------------------------------------------
  // Bulk public visa (its own key, `bulk_order_no`)
  // -------------------------------------------------------------------------

  M.OrderBulkPublicVisa.hasMany(M.OrderBulkPublicVisaDetails, {
    foreignKey: 'bulk_order_no',
    sourceKey: 'bulk_order_no',
    as: 'lines',
    ...LOOSE,
  });

  M.OrderBulkPublicVisaDetails.belongsTo(M.OrderBulkPublicVisa, {
    foreignKey: 'bulk_order_no',
    targetKey: 'bulk_order_no',
    as: 'bulkOrder',
    ...LOOSE,
  });

  // -------------------------------------------------------------------------
  // TPN
  // -------------------------------------------------------------------------

  // Joined on the TPN number rather than an id, because that is the key
  // `tbl_tpn` actually has — a `char(12)`. `tbl_tpn_notes.tpn_no` is `char(15)`,
  // a width mismatch that MySQL tolerates and that is why this is a loose join.
  M.Tpn.hasMany(M.TpnNotes, {
    foreignKey: 'tpn_no',
    sourceKey: 'tpn_no',
    as: 'notes',
    ...LOOSE,
  });

  M.Tpn.belongsTo(M.UserClient, {
    foreignKey: 'client_id',
    targetKey: 'id',
    as: 'client',
    ...LOOSE,
  });

  M.Tpn.belongsTo(M.Countries, {
    foreignKey: 'destination',
    targetKey: 'id',
    as: 'destinationCountry',
    ...LOOSE,
  });

  // -------------------------------------------------------------------------
  // Saudi invitation letters
  // -------------------------------------------------------------------------

  M.SaudiInvitationLetters.belongsTo(M.Countries, {
    foreignKey: 'destination',
    targetKey: 'id',
    as: 'destinationCountry',
    ...LOOSE,
  });

  M.SaudiInvitationLetters.belongsTo(M.Countries, {
    foreignKey: 'nationality',
    targetKey: 'id',
    as: 'nationalityCountry',
    ...LOOSE,
  });
};
