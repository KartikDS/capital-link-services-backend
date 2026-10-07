/**
 * Filing an order's documents under its client.
 *
 * Three things are under test: which folder a new upload goes to, the guard that
 * keeps a request without an order reference from storing anything, and the move
 * that runs once a guest's order gets a client. The move is where a mistake would
 * lose a passport scan, so its ordering is asserted step by step: copy, then update
 * the row, then delete the original — and each failure leaves the row pointing at a
 * file that exists.
 *
 * The models and the storage module are mocked: no table, bucket or disk is reached.
 */

const findDocuments = jest.fn();
const findChecklist = jest.fn();
const copyDocument = jest.fn();
const discardDocument = jest.fn();

jest.mock('../../src/models', () => ({
  ClsOrderDocuments: { findAll: findDocuments },
  OrderDlChecklist: { findAll: findChecklist },
}));

jest.mock('../../src/shared/storage/documents', () => ({
  copyDocument,
  discardDocument,
}));

import type { Request } from 'express';
import {
  documentFolderOf,
  filePendingDocuments,
  referenceFromForm,
} from '../../src/modules/orders/orders.documentFolders';

/** A document row, recording what it was updated to. */
const documentRow = (document: string | null, update = jest.fn().mockResolvedValue(undefined)) => ({
  document,
  update,
});

const checklistRow = (doc_file: string | null, update = jest.fn().mockResolvedValue(undefined)) => ({
  doc_file,
  update,
});

beforeEach(() => {
  findDocuments.mockReset().mockResolvedValue([]);
  findChecklist.mockReset().mockResolvedValue([]);
  copyDocument.mockReset().mockResolvedValue(['s3', 'local']);
  discardDocument.mockReset().mockResolvedValue(undefined);
});

describe('documentFolderOf', () => {
  it('files a claimed order under its client', () => {
    const resolved = { family: 'cls', row: { id: 1482, client_id: 77 }, clientId: 77 };

    expect(documentFolderOf(resolved as never)).toBe('77/1482');
  });

  it('parks an unclaimed guest order in incoming', () => {
    const resolved = { family: 'cls', row: { id: 1482, client_id: null }, clientId: null };

    expect(documentFolderOf(resolved as never)).toBe('incoming/1482');
  });

  it('refuses an order of the older family before anything is stored', () => {
    const resolved = { family: 'legacy', row: { id: 9 }, clientId: 77 };

    expect(() => documentFolderOf(resolved as never)).toThrow(/cannot be attached/);
  });
});

describe('referenceFromForm', () => {
  const requestWith = (body: unknown) => ({ body }) as Request;

  it('reads the reference field, trimmed', () => {
    expect(referenceFromForm(requestWith({ reference: '  CLS-001482 ' }))).toBe('CLS-001482');
  });

  it.each([undefined, {}, { reference: '' }, { reference: '   ' }, { reference: 42 }])(
    'refuses a request whose body is %p',
    (body) => {
      expect(() => referenceFromForm(requestWith(body))).toThrow(
        /send the order reference before the files/
      );
    }
  );
});

describe('filePendingDocuments', () => {
  it('copies, updates the row, then deletes the original — in that order', async () => {
    const calls: string[] = [];
    const update = jest.fn().mockImplementation(() => {
      calls.push('update');
      return Promise.resolve();
    });

    findDocuments.mockResolvedValue([documentRow('incoming/1482/1755-aaa-passport.pdf', update)]);
    copyDocument.mockImplementation(() => {
      calls.push('copy');
      return Promise.resolve(['s3']);
    });
    discardDocument.mockImplementation(() => {
      calls.push('discard');
      return Promise.resolve();
    });

    const moved = await filePendingDocuments(1482, 77);

    expect(moved).toBe(1);
    expect(calls).toEqual(['copy', 'update', 'discard']);
    expect(copyDocument).toHaveBeenCalledWith(
      'incoming/1482/1755-aaa-passport.pdf',
      '77/1482/1755-aaa-passport.pdf'
    );
    expect(update).toHaveBeenCalledWith({ document: '77/1482/1755-aaa-passport.pdf' });
    expect(discardDocument).toHaveBeenCalledWith('incoming/1482/1755-aaa-passport.pdf');
  });

  it('moves a checklist line’s file as well as the loose documents', async () => {
    const update = jest.fn().mockResolvedValue(undefined);

    findChecklist.mockResolvedValue([checklistRow('incoming/1482/1755-bbb-birth.pdf', update)]);

    expect(await filePendingDocuments(1482, 77)).toBe(1);
    expect(update).toHaveBeenCalledWith({ doc_file: '77/1482/1755-bbb-birth.pdf' });
  });

  it('leaves files that are already filed, or belong elsewhere, alone', async () => {
    findDocuments.mockResolvedValue([
      documentRow('77/1482/1755-aaa-passport.pdf'),
      documentRow('incoming/999/1755-ccc-other.pdf'),
      documentRow('clients/77/1755-ddd-old-layout.pdf'),
      documentRow(null),
    ]);

    expect(await filePendingDocuments(1482, 77)).toBe(0);
    expect(copyDocument).not.toHaveBeenCalled();
    expect(discardDocument).not.toHaveBeenCalled();
  });

  it('is a no-op the second time, because a moved file no longer matches', async () => {
    findDocuments.mockResolvedValue([documentRow('77/1482/1755-aaa-passport.pdf')]);

    expect(await filePendingDocuments(1482, 77)).toBe(0);
    expect(copyDocument).not.toHaveBeenCalled();
  });

  it('keeps the original and the row when nothing could be copied', async () => {
    const update = jest.fn();

    findDocuments.mockResolvedValue([documentRow('incoming/1482/1755-aaa-passport.pdf', update)]);
    copyDocument.mockResolvedValue([]);

    expect(await filePendingDocuments(1482, 77)).toBe(0);
    expect(update).not.toHaveBeenCalled();
    expect(discardDocument).not.toHaveBeenCalled();
  });

  it('removes the copy, not the original, when the row cannot be updated', async () => {
    const update = jest.fn().mockRejectedValue(new Error('deadlock'));

    findDocuments.mockResolvedValue([documentRow('incoming/1482/1755-aaa-passport.pdf', update)]);

    expect(await filePendingDocuments(1482, 77)).toBe(0);
    expect(discardDocument).toHaveBeenCalledTimes(1);
    expect(discardDocument).toHaveBeenCalledWith('77/1482/1755-aaa-passport.pdf');
  });

  it('carries on with the next file after one fails', async () => {
    findDocuments.mockResolvedValue([
      documentRow('incoming/1482/1755-aaa-first.pdf'),
      documentRow('incoming/1482/1755-bbb-second.pdf'),
    ]);
    copyDocument.mockResolvedValueOnce([]).mockResolvedValueOnce(['s3']);

    expect(await filePendingDocuments(1482, 77)).toBe(1);
  });
});
