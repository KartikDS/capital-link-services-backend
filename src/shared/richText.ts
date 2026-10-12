import sanitizeHtml from 'sanitize-html';

/**
 * The one allow-list for staff-authored page copy.
 *
 * The admin's rich-text editor can only produce the tags below, but the API
 * does not trust the editor: anything arriving here is rebuilt through this
 * list, so a hand-written request cannot store a `<script>`, an inline event
 * handler or a `javascript:` link either. The website runs the same list again
 * on the way out — see `lib/richText.ts` in the frontend — so a row edited
 * directly in the database is covered too.
 *
 * Keep the two lists identical.
 */
const ALLOWED_TAGS = [
  'p',
  'br',
  'h2',
  'h3',
  'h4',
  'strong',
  'em',
  'u',
  's',
  'ul',
  'ol',
  'li',
  'blockquote',
  'hr',
  'a',
];

/**
 * `tbl_content_pages.html` is a latin1 column. The connection transcodes the
 * characters latin1 has (curly quotes and dashes are in its Windows-1252 range),
 * but anything else — an emoji, a non-Latin letter pasted from Word — would be
 * stored as `?`. Those are written as numeric entities instead, which the
 * browser renders as the original character.
 */
const LATIN1_SAFE = /[^\t\n\r -ÿ€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/gu;

const toEntities = (html: string): string =>
  html.replace(LATIN1_SAFE, (char) => `&#${char.codePointAt(0)};`);

export const sanitizeRichText = (html: string): string =>
  toEntities(
    sanitizeHtml(html, {
      allowedTags: ALLOWED_TAGS,
      allowedAttributes: { a: ['href', 'target', 'rel'] },
      allowedSchemes: ['http', 'https', 'mailto', 'tel'],
      allowProtocolRelative: false,
      transformTags: {
        a: (tagName, attribs) => ({
          tagName,
          attribs: {
            ...attribs,
            ...(attribs.target === '_blank' ? { rel: 'noopener noreferrer' } : {}),
          },
        }),
      },
    })
  ).trim();

/** True when the markup carries no visible text — an editor left empty saves `<p></p>`. */
export const isBlankRichText = (html: string): boolean =>
  sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/&nbsp;|\s/g, '')
    .length === 0;

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * A stored description as HTML that is safe to render, or null when it says nothing.
 *
 * Rows CLS wrote before the editor existed are plain text with line breaks, and
 * some carry Word markup (`<p class="MsoNormal">`, `<o:p>`). Markup goes through
 * the allow-list; plain text is escaped and split into paragraphs on blank lines so
 * the website does not collapse it into one run of words.
 */
export const toRenderableHtml = (value: string | null | undefined): string | null => {
  if (!value || isBlankRichText(value)) return null;

  const html = /<[a-z][^>]*>/i.test(value)
    ? sanitizeRichText(value)
    : value
        .trim()
        .split(/\r?\n\s*\r?\n/)
        .map((block) => `<p>${escapeHtml(block.trim()).replace(/\r?\n/g, '<br>')}</p>`)
        .join('');

  return isBlankRichText(html) ? null : html;
};
