import {
  requestOf,
  splitAddress,
  splitDocumentNote,
  websiteNoteOf,
} from '../../src/modules/admin/legalisationRequest';

/**
 * The new attestation form's answers, read back out of what the website lodged.
 *
 * The note below is what the frontend's `orderNoteFrom(describeAttestationRequest(…))`
 * produces for a full order, line for line. If that description's labels change this
 * is the test that should fail, because the admin screen would stop showing what the
 * client asked for.
 */

const WEBSITE_NOTE = [
  'Destination: China',
  'Document origin: Australia',
  'Indicative route: Embassy legalisation',
  'Document type: Personal documents',
  'Services: Degree; Birth certificate; Other: Translation of a will',
  'Contact: Jo Bloggs',
  'Email: jo@example.com',
  'Phone: 0400 000 000',
  'Address: 1 High St, Unit 2, Sydney, NSW, 2000, Australia',
  'Delivery: cls',
  'Company: Acme Pty Ltd',
  'Needed by: 2026-11-30',
  'Documents: Degree x2 (certified copy) [a.pdf, b.pdf]; Birth certificate x1',
  'Original documents: Client is sending originals to the CLS office',
  'Client reference: REF-9',
  'Commercial invoice no.: INV-77',
  'Return address: 1 High St, Unit 2, Sydney, NSW, 2000, Australia',
  'Order instructions: Please hurry.',
  'Foo: this wrapped line is part of the instructions',
].join('\n');

const row = <T extends object>(columns: T) => columns as never;

const websiteNote = (text: string, id = 5) =>
  row({
    id,
    note: text,
    note_by_name: 'Website order form',
    user_type: 'client',
    document_type: null,
    is_admin: 0,
  });

describe('websiteNoteOf', () => {
  it('finds the oldest website-form note and ignores consultant tracker rows', () => {
    const rows = [
      row({ id: 9, note: 'later', note_by_name: 'Website order form', document_type: null }),
      row({ id: 3, note: 'tracker', note_by_name: 'Website order form', document_type: 'Degree' }),
      row({ id: 2, note: 'staff', note_by_name: 'Sam', document_type: null }),
      websiteNote('first', 4),
    ];

    expect((websiteNoteOf(rows) as { id: number }).id).toBe(4);
  });

  it('is null when there is none', () => {
    expect(websiteNoteOf([])).toBeNull();
  });
});

describe('requestOf', () => {
  const full = () =>
    requestOf({
      notes: [websiteNote(WEBSITE_NOTE)],
      checklist: [
        row({ id: 1, type: 'Degree', number: 2, note: 'certified copy — Files to follow: a.pdf, b.pdf' }),
        row({ id: 2, type: 'Birth certificate', number: 1, note: null }),
      ],
      returnDocument: row({ additional_comment: 'Please hurry.' }),
      department: 'Acme Pty Ltd',
    });

  it('reads every requirement the form collected', () => {
    expect(full().requirements).toEqual({
      destination: 'China',
      documentOrigin: 'Australia',
      indicativeRoute: 'Embassy legalisation',
      documentType: 'Personal documents',
      services: ['Degree', 'Birth certificate', 'Other: Translation of a will'],
      neededBy: '2026-11-30',
      sendingOriginals: true,
      clientReference: 'REF-9',
      commercialInvoiceNumber: 'INV-77',
    });
  });

  it('splits the contact address and takes the company from the order column', () => {
    expect(full().contact).toEqual({
      company: 'Acme Pty Ltd',
      address: {
        raw: '1 High St, Unit 2, Sydney, NSW, 2000, Australia',
        address: '1 High St, Unit 2',
        city: 'Sydney',
        state: 'NSW',
        postcode: '2000',
        country: 'Australia',
      },
    });
  });

  it('reads delivery handling, derives "same as contact" and prefers the column for instructions', () => {
    expect(full().delivery).toEqual({
      handling: 'cls',
      handlingLabel: 'CLS handles it',
      returnAddressUnavailable: false,
      sameAsContactAddress: true,
      returnAddress: '1 High St, Unit 2, Sydney, NSW, 2000, Australia',
      instructions: 'Please hurry.',
    });
  });

  it('lists the documents from the checklist rows, with the files split from the note', () => {
    expect(full().documents).toEqual([
      { id: 1, name: 'Degree', quantity: 2, note: 'certified copy', files: ['a.pdf', 'b.pdf'] },
      { id: 2, name: 'Birth certificate', quantity: 1, note: null, files: [] },
    ]);
  });

  it('keeps the whole note, and folds an unknown "Label: x" line into the line above', () => {
    const request = requestOf({
      notes: [websiteNote(WEBSITE_NOTE)],
      checklist: [],
      returnDocument: null,
      department: null,
    });

    expect(request.raw).toBe(WEBSITE_NOTE);
    expect(request.noteId).toBe(5);
    expect(request.fromWebsite).toBe(true);
    // No column for the instructions here, so the note's own line is used — wrapped line included.
    expect(request.delivery.instructions).toBe(
      'Please hurry.\nFoo: this wrapped line is part of the instructions'
    );
  });

  it('marks an unavailable return address and "I’ll handle it"', () => {
    const request = requestOf({
      notes: [
        websiteNote(
          [
            'Delivery: self',
            'Address: 1 High St, Sydney, NSW, 2000, Australia',
            'Return address: Not available yet — confirm with client',
          ].join('\n')
        ),
      ],
      checklist: [],
      returnDocument: null,
      department: null,
    });

    expect(request.delivery).toEqual({
      handling: 'self',
      handlingLabel: 'I’ll handle it',
      returnAddressUnavailable: true,
      sameAsContactAddress: null,
      returnAddress: null,
      instructions: null,
    });
    expect(request.requirements.sendingOriginals).toBe(false);
  });

  it('says the return address differs when it is not the contact address', () => {
    const request = requestOf({
      notes: [
        websiteNote(
          [
            'Delivery: cls',
            'Address: 1 High St, Sydney, NSW, 2000, Australia',
            'Return address: 9 Low Rd, Perth, WA, 6000, Australia',
          ].join('\n')
        ),
      ],
      checklist: [],
      returnDocument: null,
      department: null,
    });

    expect(request.delivery.sameAsContactAddress).toBe(false);
  });

  it('passes through an unrecognised delivery id rather than hiding it', () => {
    const request = requestOf({
      notes: [websiteNote('Delivery: courier-x')],
      checklist: [],
      returnDocument: null,
      department: null,
    });

    expect(request.delivery.handling).toBeNull();
    expect(request.delivery.handlingLabel).toBe('courier-x');
  });

  it('is empty, and not "from the website", when the order has no website note', () => {
    const request = requestOf({
      notes: [],
      checklist: [],
      returnDocument: null,
      department: '  ',
    });

    expect(request.fromWebsite).toBe(false);
    expect(request.raw).toBeNull();
    expect(request.noteId).toBeNull();
    expect(request.requirements.services).toEqual([]);
    expect(request.contact).toEqual({ company: null, address: null });
    expect(request.delivery.instructions).toBeNull();
  });
});

describe('splitAddress', () => {
  it('returns null for nothing', () => {
    expect(splitAddress(null)).toBeNull();
    expect(splitAddress('  ')).toBeNull();
  });

  it('returns the raw text only when it has too few parts to split safely', () => {
    expect(splitAddress('Somewhere, Australia')).toEqual({
      raw: 'Somewhere, Australia',
      address: null,
      city: null,
      state: null,
      postcode: null,
      country: null,
    });
  });
});

describe('splitDocumentNote', () => {
  it('handles nothing, a plain note, files only, and note plus files', () => {
    expect(splitDocumentNote(null)).toEqual({ note: null, files: [] });
    expect(splitDocumentNote('plain')).toEqual({ note: 'plain', files: [] });
    expect(splitDocumentNote('Files to follow: a.pdf')).toEqual({
      note: null,
      files: ['a.pdf'],
    });
    expect(splitDocumentNote('hello — Files to follow: a.pdf, b.pdf')).toEqual({
      note: 'hello',
      files: ['a.pdf', 'b.pdf'],
    });
  });
});
