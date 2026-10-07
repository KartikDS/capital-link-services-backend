import {
  INCOMING_DIR,
  clientFolder,
  filedPath,
  isIncomingFor,
  orderFolder,
} from '../../src/shared/storage/documentFolders';

/**
 * Which folder a document is filed in.
 *
 * `{clientId}/{orderId}` for everything that belongs to an order, whoever uploaded
 * it; `incoming/{orderId}` only while a guest's order has no client yet. These are
 * pure functions, so the whole layout is pinned here without a bucket or a table.
 */

describe('orderFolder', () => {
  it('files an order under its client', () => {
    expect(orderFolder({ id: 1482, client_id: 77 })).toBe('77/1482');
  });

  it('parks a guest order in incoming until it has a client', () => {
    expect(orderFolder({ id: 1482, client_id: null })).toBe(`${INCOMING_DIR}/1482`);
  });

  it('treats the zero some legacy rows hold as no client', () => {
    expect(orderFolder({ id: 1482, client_id: 0 })).toBe(`${INCOMING_DIR}/1482`);
  });

  it.each([0, -3, 1.5, Number.NaN])('refuses order id %p', (id) => {
    expect(() => orderFolder({ id, client_id: 77 })).toThrow();
  });
});

describe('clientFolder', () => {
  it('files a profile photo and an unattached upload under the client', () => {
    expect(clientFolder(77, 'profile')).toBe('77/profile');
    expect(clientFolder('77', 'unattached')).toBe('77/unattached');
  });

  it.each(['', 'abc', '0', '-1', '7/../8', 'undefined'])('refuses client id %p', (id) => {
    expect(() => clientFolder(id, 'profile')).toThrow();
  });
});

describe('isIncomingFor', () => {
  it("recognises only this order's waiting files", () => {
    expect(isIncomingFor('incoming/1482/1755781234-a3f2c1-passport.pdf', 1482)).toBe(true);
    expect(isIncomingFor('incoming/1482/x.pdf', 14)).toBe(false);
    expect(isIncomingFor('incoming/14820/x.pdf', 1482)).toBe(false);
    expect(isIncomingFor('77/1482/x.pdf', 1482)).toBe(false);
    expect(isIncomingFor('clients/77/x.pdf', 1482)).toBe(false);
  });

  it('reads a path stored with backslashes', () => {
    expect(isIncomingFor('incoming\\1482\\x.pdf', 1482)).toBe(true);
  });
});

describe('filedPath', () => {
  it('changes the folder and keeps the file name untouched', () => {
    expect(filedPath('incoming/1482/1755781234-a3f2c1-passport.pdf', 77, 1482)).toBe(
      '77/1482/1755781234-a3f2c1-passport.pdf'
    );
  });

  it('is null for a path that is not one of the order’s waiting files', () => {
    expect(filedPath('77/1482/x.pdf', 77, 1482)).toBeNull();
    expect(filedPath('incoming/999/x.pdf', 77, 1482)).toBeNull();
    expect(filedPath('incoming/1482/', 77, 1482)).toBeNull();
  });

  it('is null for a client id that is not a real one', () => {
    expect(filedPath('incoming/1482/x.pdf', 0, 1482)).toBeNull();
  });
});
