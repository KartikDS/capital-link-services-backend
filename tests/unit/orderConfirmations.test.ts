import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Holding an order's confirmation until the money lands.
 *
 * An order that has not been paid for is not confirmed, so nothing is sent about
 * it — but the confirmation can only be *rendered* at checkout, because the order
 * tables fold half of what the client's template prints into free text. So it is
 * rendered early and parked, and released by the payment.
 *
 * Two properties carry the whole design and both are asserted below:
 *
 * 1. **Taking is atomic.** The webhook and the success page both ask on every
 *    payment. If they could both get it, one payment would send two confirmations.
 * 2. **Nothing lingers.** These files hold names, passport numbers and addresses.
 *    A checkout nobody completed must not leave one on disk indefinitely.
 */

const uploadDir = path.join(
  os.tmpdir(),
  `cls-confirmations-${process.pid}-${Date.now()}`
);

jest.mock('../../src/config/env', () => ({
  env: { uploads: { dir: uploadDir } },
}));

import {
  discard,
  park,
  take,
  type ParkedConfirmation,
} from '../../src/modules/orders/orders.confirmations';

const spool = () => path.join(uploadDir, 'pending-confirmations');

const confirmation = (subject = 'Your CLS order'): ParkedConfirmation => ({
  content: { subject, html: `<p>${subject}</p>`, text: subject },
  recipient: 'priya@example.com',
});

afterEach(async () => {
  await fs.rm(uploadDir, { recursive: true, force: true });
});

describe('park and take', () => {
  it('gives back exactly what was parked', async () => {
    expect(await park('CLS-001482', confirmation())).toBe(true);

    expect(await take('CLS-001482')).toEqual(confirmation());
  });

  it('hands the confirmation over once, and only once', async () => {
    await park('CLS-001482', confirmation());

    const first = await take('CLS-001482');
    const second = await take('CLS-001482');

    // The second caller is the other confirmation path. If it also got the
    // email, one payment would produce two confirmations.
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it('lets only one of two simultaneous callers win', async () => {
    await park('CLS-001482', confirmation());

    // The actual race the design exists for: the Stripe webhook and
    // /payment/success arriving together.
    const results = await Promise.all([
      take('CLS-001482'),
      take('CLS-001482'),
      take('CLS-001482'),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('deletes the client’s details once the confirmation has been taken', async () => {
    await park('CLS-001482', confirmation());
    await take('CLS-001482');

    const left = await fs.readdir(spool());

    // The parked email holds their name, passport number and address, and will
    // never be read again. What stays is the empty marker that records the
    // confirmation as taken — see the next test for why it has to.
    expect(left).toEqual(['CLS-001482.json.claim']);
    expect(await fs.readFile(path.join(spool(), left[0]!), 'utf8')).toBe('');
  });

  it('stays taken, so a late redelivery cannot send it a second time', async () => {
    await park('CLS-001482', confirmation());
    await take('CLS-001482');

    // Stripe redelivers on a timeout, on a non-2xx, and sometimes for no reason
    // at all — hours later. The marker is what makes the claim outlive the
    // request that made it.
    expect(await take('CLS-001482')).toBeNull();
  });

  it('answers null for an order that was never parked', async () => {
    expect(await take('CLS-999999')).toBeNull();
  });

  it('overwrites when a client restarts a checkout', async () => {
    await park('CLS-001482', confirmation('First attempt'));
    await park('CLS-001482', confirmation('Second attempt'));

    const taken = await take('CLS-001482');

    // The newer order is the one they went on to pay for.
    expect(taken?.content.subject).toBe('Second attempt');
    expect(await take('CLS-001482')).toBeNull();
  });

  it('can be taken again after a fresh confirmation is parked over a taken one', async () => {
    await park('CLS-001482', confirmation('First'));
    await take('CLS-001482');

    // A restarted checkout parks a new one. The marker from the first take must
    // not make it unclaimable — parking means it has not been sent.
    await park('CLS-001482', confirmation('Second'));

    expect((await take('CLS-001482'))?.content.subject).toBe('Second');
  });

  it('keeps one order’s confirmation separate from another’s', async () => {
    await park('CLS-000001', confirmation('One'));
    await park('CLS-000002', confirmation('Two'));

    expect((await take('CLS-000002'))?.content.subject).toBe('Two');
    expect((await take('CLS-000001'))?.content.subject).toBe('One');
  });

  it('carries a null recipient through, because a guest may give no address', async () => {
    await park('CLS-001482', { ...confirmation(), recipient: null });

    expect((await take('CLS-001482'))?.recipient).toBeNull();
  });
});

describe('references that are not usable filenames', () => {
  it.each([
    ['..', 'the directory itself'],
    ['../../etc/passwd', 'a path escape'],
    ['CLS/001482', 'a separator'],
    ['', 'nothing at all'],
  ])('refuses to park %p — %s', async (reference) => {
    expect(await park(reference, confirmation())).toBe(false);
  });

  it('refuses to take one too, rather than reading outside the spool', async () => {
    expect(await take('../../etc/passwd')).toBeNull();
  });

  it('writes nothing to disk when it refuses', async () => {
    await park('../escape', confirmation());

    // Not even the directory, since the refusal comes before the mkdir.
    await expect(fs.readdir(spool())).rejects.toThrow();
  });
});

describe('discard', () => {
  it('throws an unsent confirmation away', async () => {
    await park('CLS-001482', confirmation());
    await discard('CLS-001482');

    expect(await take('CLS-001482')).toBeNull();
  });

  it('is silent about an order with nothing parked', async () => {
    // The checkout discards on any Stripe failure, including ones that happen
    // before anything was parked.
    await expect(discard('CLS-999999')).resolves.toBeUndefined();
  });
});

describe('the sweep', () => {
  it('removes confirmations too old to belong to a live checkout', async () => {
    await park('CLS-000001', confirmation('Abandoned'));

    // Three days back. A Stripe session expires after one, so no payment can
    // ever arrive to release this.
    const stale = path.join(spool(), 'CLS-000001.json');
    const longAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    await fs.utimes(stale, longAgo, longAgo);

    // The sweep runs on the way past rather than on a timer.
    await park('CLS-000002', confirmation('Current'));

    expect(await take('CLS-000001')).toBeNull();
    expect((await take('CLS-000002'))?.content.subject).toBe('Current');
  });

  it('leaves a confirmation that a payment could still release', async () => {
    await park('CLS-000001', confirmation('Yesterday'));

    const recent = path.join(spool(), 'CLS-000001.json');
    const yesterday = new Date(Date.now() - 20 * 60 * 60 * 1000);
    await fs.utimes(recent, yesterday, yesterday);

    await park('CLS-000002', confirmation('Current'));

    expect((await take('CLS-000001'))?.content.subject).toBe('Yesterday');
  });
});
