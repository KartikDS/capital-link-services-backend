import { translationDisplayNameOf } from '../../src/domain/translationDocuments';
import { displayNameOf } from '../../src/shared/storage/documents';

/**
 * The name a person sees for a stored document, rather than its storage key.
 * The portal listed `clients/9216/1788998196055-77143399a844-2-i-addendum.pdf`.
 */
describe('displayNameOf', () => {
  it.each([
    ['clients/9216/1788998196055-77143399a844-2-i-addendum.pdf', '2-i-addendum.pdf'],
    [
      '9216/10034664/1793143798189-4abcf3b3b73b-user-manual-cgc-guidelines.pdf',
      'user-manual-cgc-guidelines.pdf',
    ],
    ['clients\\9216\\1788998196055-77143399a844-passport.jpg', 'passport.jpg'],
  ])('drops the folders and the timestamp-nonce prefix: %s', (stored, shown) => {
    expect(displayNameOf(stored)).toBe(shown);
  });

  it('leaves a legacy bare filename alone', () => {
    expect(displayNameOf('test.pdf')).toBe('test.pdf');
    expect(displayNameOf('clients/12/passport.pdf')).toBe('passport.pdf');
  });

  it('does not eat a name that merely starts with digits', () => {
    expect(displayNameOf('clients/1/2024-invoice.pdf')).toBe('2024-invoice.pdf');
  });

  it('shows Document.ext when the client filename slugged to nothing', () => {
    expect(displayNameOf('clients/9216/1788998196055-77143399a844.jpg')).toBe('Document.jpg');
  });

  it('falls back to Document for an empty value', () => {
    expect(displayNameOf(null)).toBe('Document');
    expect(displayNameOf('')).toBe('Document');
  });
});

describe('translationDisplayNameOf', () => {
  it('drops the base-36 stamp and nonce', () => {
    expect(translationDisplayNameOf('lq3x9k2a-a3f2c1-birth-certificate.pdf')).toBe('birth-certificate.pdf');
  });

  it('shows Document.ext when the slug was empty', () => {
    expect(translationDisplayNameOf('lq3x9k2a-a3f2c1.jpg')).toBe('Document.jpg');
  });

  it('leaves an unprefixed name alone', () => {
    expect(translationDisplayNameOf('passport.pdf')).toBe('passport.pdf');
  });
});
