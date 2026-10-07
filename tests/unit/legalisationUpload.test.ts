/**
 * The comment-attachment allow-list on the Document Legalisation screen.
 *
 * Legacy `checkMediaTypeFromAttachment` let exactly four MIME types through —
 * `image/png`, `image/jpeg`, `image/jpg`, `application/pdf` — and refused
 * everything else with a fixed message. The general upload allow-list is wider
 * (Word, HEIC, WebP); the brief for this screen is "same as before", so it has its
 * own, narrower filter and this pins it.
 */

import {
  LEGALISATION_NOTE_RESTRICTED,
  legalisationNoteFilter,
} from '../../src/middleware/upload';

const run = (originalname: string, mimetype: string) => {
  const callback = jest.fn();
  legalisationNoteFilter(
    {} as never,
    { originalname, mimetype } as Express.Multer.File,
    callback
  );
  return callback.mock.calls[0] as [Error | null, boolean?];
};

describe('legalisationNoteFilter', () => {
  it.each([
    ['scan.pdf', 'application/pdf'],
    ['photo.png', 'image/png'],
    ['photo.JPG', 'image/jpeg'],
    ['photo.jpeg', 'image/jpeg'],
    ['photo.jpg', 'image/jpg'],
  ])('accepts %s as %s', (name, type) => {
    expect(run(name, type)).toEqual([null, true]);
  });

  it.each([
    ['letter.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['photo.heic', 'image/heic'],
    ['photo.webp', 'image/webp'],
    ['shell.php', 'application/pdf'],
    ['scan.pdf', 'text/html'],
    ['noextension', 'application/pdf'],
  ])('refuses %s as %s with the legacy wording', (name, type) => {
    const [error] = run(name, type);
    expect(error?.message).toBe(LEGALISATION_NOTE_RESTRICTED);
    expect(LEGALISATION_NOTE_RESTRICTED).toBe(
      'File you are trying to upload is restricted and operation is aborted!!'
    );
  });
});
