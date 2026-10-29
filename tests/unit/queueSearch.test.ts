import {
  passportPhotoSearchSql,
  queueSearchSql,
  searchWords,
  translationSearchSql,
  type SearchQueue,
} from '../../src/modules/admin/queueSearch';

// The real escape is `sequelize.escape`; this one quotes the same way for the
// purposes of reading the SQL.
const escape = (value: string) =>
  `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const sql = (queue: SearchQueue, search: string) => queueSearchSql(queue, search, escape);

describe('searchWords', () => {
  it('splits on any whitespace and drops the empties', () => {
    expect(searchWords('  Isaac   Pepe ')).toEqual(['Isaac', 'Pepe']);
    expect(searchWords('')).toEqual([]);
    expect(searchWords(undefined)).toEqual([]);
  });

  it('stops at six words', () => {
    expect(searchWords('a b c d e f g h')).toHaveLength(6);
  });
});

describe('queueSearchSql', () => {
  it('is no condition at all for an empty search', () => {
    expect(sql('public-visa', '   ')).toEqual([]);
  });

  it('writes one condition per word, so every word has to match', () => {
    expect(sql('public-visa', 'isaac pepe')).toHaveLength(2);
  });

  it('finds the Order No. a consultant sees, which is the order id', () => {
    const [condition] = sql('public-visa', '34668');

    expect(condition).toContain('CAST(ClsOrder.id AS CHAR) LIKE');
    expect(condition).toContain("'%34668%'");
  });

  it('still finds the migrated order number', () => {
    expect(sql('public-visa', 'x')[0]).toContain('ClsOrder.order_no LIKE');
  });

  it.each<[SearchQueue, string[]]>([
    [
      'public-visa',
      [
        'ClsOrder.date_submitted',
        'ClsOrder.departure_date',
        'tbl_order_traveller_details',
        'ClsOrder.destination IN (SELECT c.id FROM tbl_countries',
        'tbl_user_admin',
        'tbl_public_visa_type_locations',
        'tbl_cls_order_destinations',
      ],
    ],
    [
      'police-clearance',
      ['tbl_order_traveller_details', 'tbl_police_clearances', 'tbl_user_admin'],
    ],
    [
      'russian-visa-voucher',
      ['tbl_russian_visa_voucher_types', 'tbl_order_traveller_details'],
    ],
    [
      'document-delivery',
      ['contact_first_name', 'contact_email', 'tbl_order_doc_delivery_details'],
    ],
    [
      'document-legalisation',
      [
        'contact_first_name',
        'country_name_display',
        'tbl_order_return_document_details',
        'tbl_document_legalization_order_details',
        'tbl_user_admin',
      ],
    ],
  ])('searches every column the %s queue shows', (queue, expected) => {
    // A word that matches nothing special still gets every text predicate.
    const [condition] = sql(queue, 'zzz');

    expected.forEach((fragment) => expect(condition).toContain(fragment));
  });

  it('reads the status in the queue’s own words', () => {
    expect(sql('public-visa', 'paid')[0]).toContain('ClsOrder.status IN (1)');
    expect(sql('public-visa', 'pend')[0]).toContain('ClsOrder.status IN (0)');
    // "Completed" is code 2 on a queue — the order screen's word for code 1.
    expect(sql('public-visa', 'completed')[0]).toContain('ClsOrder.status IN (2)');
  });

  it('adds no status test for a word that is not a status', () => {
    expect(sql('public-visa', 'zzz')[0]).not.toContain('ClsOrder.status IN');
  });

  it('matches the scan status the screen prints, by the furthest stamp reached', () => {
    const none = sql('public-visa', 'not')[0];
    const scan3 = sql('public-visa', 'scan3')[0];

    // "Not received yet" is the absence of every stamp.
    expect(none).toContain('NOT (ClsOrder.id IN (SELECT d.order_id');
    // Scan3 is the third stamp and not the fourth.
    expect(scan3).toContain('visa_date_completed_and_received_at_cls');
    expect(scan3).toContain('NOT (ClsOrder.id IN');
  });

  it('adds no scan-status test for a word that is not one', () => {
    expect(sql('public-visa', 'zzz')[0]).not.toContain(
      'visa_date_cls_received_all_items'
    );
  });

  it('matches a person by name or by email, on the traveller and the team member', () => {
    const [condition] = sql('public-visa', 'rania');

    expect(condition).toContain('t.email LIKE');
    expect(condition).toContain('u.email LIKE');
    expect(condition).toContain("CONCAT_WS(' ', u.fname, u.lname) LIKE");
  });

  it('reads a date the way the screen and the keyboard write it', () => {
    const [condition] = sql('public-visa', '28');

    ['%e %b %Y', '%d/%m/%Y', '%d-%m-%Y', '%Y-%m-%d', '%e %M %Y'].forEach((format) =>
      expect(condition).toContain(`'${format}`)
    );
    // The submitted time is searchable, the departure's is not — a day has none.
    expect(condition).toContain('%l:%i %p');
  });

  it('keeps a typed wildcard a character, not a pattern', () => {
    const [percent] = sql('public-visa', '50%');
    const [underscore] = sql('public-visa', 'a_b');

    expect(percent).toContain("'%50\\\\%%'");
    expect(underscore).toContain("'%a\\\\_b%'");
  });

  it('never lets a quote out of the string it is in', () => {
    const [condition] = sql('public-visa', "o'brien");

    expect(condition).toContain("'%o\\'brien%'");
    expect(condition).not.toContain("'%o'brien%'");
  });
});

describe('the All services list', () => {
  it('reads a pasted CLS reference as the order it names', () => {
    expect(sql('all-services', 'CLS-034668')[0]).toContain('ClsOrder.id = 34668');
    expect(sql('all-services', '34668')[0]).not.toContain('ClsOrder.id = ');
  });

  it('matches the service by the words on the Orders tabs', () => {
    expect(sql('all-services', 'police')[0]).toContain('ClsOrder.order_type IN (5)');
    expect(sql('all-services', 'legalisation')[0]).toContain(
      'ClsOrder.order_type IN (9)'
    );
    expect(sql('all-services', 'zzz')[0]).not.toContain('order_type IN');
  });

  it('tells paid from unpaid', () => {
    expect(sql('all-services', 'paid')[0]).toContain('payment_status IN (1)');
    expect(sql('all-services', 'unpaid')[0]).toContain('payment_status IN (0)');
  });

  it('matches a total with or without the dollar sign', () => {
    expect(sql('all-services', '$140')[0]).toContain(
      "CAST(ClsOrder.total_fee AS CHAR) LIKE '%140%'"
    );
    expect(sql('all-services', 'abc')[0]).not.toContain('total_fee');
  });
});

describe('the single-table lists', () => {
  it('searches translation enquiries by every column they show', () => {
    const [condition] = translationSearchSql('arabic', escape);

    [
      'full_name',
      'email',
      'phone',
      'language_from',
      'language_to',
      'document_name',
      'DATE_FORMAT(created',
    ].forEach((fragment) => expect(condition).toContain(fragment));
  });

  it('searches passport photos by name in either order, email, type and date', () => {
    const [condition] = passportPhotoSearchSql('maria', escape);

    [
      "CONCAT_WS(' ', fname, lname)",
      'email LIKE',
      'type LIKE',
      'DATE_FORMAT(passport_updated_at',
    ].forEach((fragment) => expect(condition).toContain(fragment));
  });

  it('is no condition for an empty search', () => {
    expect(translationSearchSql('', escape)).toEqual([]);
    expect(passportPhotoSearchSql(undefined, escape)).toEqual([]);
  });
});
