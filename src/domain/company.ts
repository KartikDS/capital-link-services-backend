/**
 * Capital Link Services' own contact details.
 *
 * These are in code rather than in the database because the database has
 * nowhere to put them. `tbl_user_admin` holds a staff member's name, email and
 * password and nothing else — no phone number, no job title, no photograph — so
 * a consultant record assembled purely from the schema would be a name and an
 * address with four empty strings after it.
 *
 * What the API returns instead: the consultant's real name and real email from
 * `tbl_user_admin`, and CLS's published switchboard number and a generic title
 * from here. Every field is then true. The alternative — inventing a direct line
 * per consultant — would put a number on screen that rings nowhere.
 *
 * If CLS wants per-consultant titles and direct lines in the portal, that needs
 * columns on `tbl_user_admin` that do not exist, which is a schema change and
 * therefore theirs to make.
 */

export const CLS_CONTACT = {
  /** The published switchboard. Correct for every consultant. */
  phone: '+61 2 6282 7155',
  phoneHref: 'tel:+61262827155',
  /** Shown when a consultant's own title is not recorded, because none is. */
  defaultPosition: 'Capital Link Services consultant',
  companyName: 'Capital Link Services',
  /** Empty rather than a placeholder image: the portal renders initials for it. */
  defaultPhoto: '',
} as const;

/**
 * The consultant shape the website's portal types expect.
 *
 * Matches `PortalConsultant` in the website exactly. It is not optional there —
 * every screen that shows an order shows a consultant — so this API returns
 * either a complete record or `null`, and the website falls back to its own
 * roster on null rather than rendering a half-filled card.
 */
export interface ConsultantView {
  name: string;
  position: string;
  email: string;
  phone: string;
  phoneHref: string;
  photo: string;
}

export const toConsultantView = (
  name: string | null,
  email: string | null
): ConsultantView | null => {
  // No name means no useful record. Null lets the website show its own roster
  // instead of a card with a blank where the name goes.
  if (!name) return null;

  return {
    name,
    position: CLS_CONTACT.defaultPosition,
    email: email ?? '',
    phone: CLS_CONTACT.phone,
    phoneHref: CLS_CONTACT.phoneHref,
    photo: CLS_CONTACT.defaultPhoto,
  };
};
