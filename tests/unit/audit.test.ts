import type { Request } from 'express';
import { Logs } from '../../src/models';
import { audit } from '../../src/domain/audit';

jest.mock('../../src/models', () => ({ Logs: { create: jest.fn() } }));

const create = Logs.create as unknown as jest.Mock;
const asRequest = (sub: number | undefined) =>
  ({ auth: sub === undefined ? undefined : { sub } }) as unknown as Request;

describe('audit', () => {
  beforeEach(() => create.mockReset().mockResolvedValue({}));

  it('writes an admin-area row naming the staff member and the action', async () => {
    await audit(asRequest(110), 'enquiry.assign', { enquiryId: 7, assignedTo: 135 });

    expect(create).toHaveBeenCalledTimes(1);
    const row = create.mock.calls[0][0] as Record<string, unknown>;
    expect(row.area).toBe('admin');
    expect(row.user_type).toBe('admin');
    expect(row.user_id).toBe(110);
    expect(JSON.parse(row.log_details as string)).toEqual({
      action: 'enquiry.assign',
      enquiryId: 7,
      assignedTo: 135,
    });
    expect(typeof row.log_datetime).toBe('string');
  });

  it('records a null user when the request carries no session', async () => {
    await audit(asRequest(undefined), 'enquiry.delete', { enquiryId: 7 });

    expect((create.mock.calls[0][0] as { user_id: unknown }).user_id).toBeNull();
  });

  it('never throws, so a failed audit write cannot undo the action it recorded', async () => {
    create.mockRejectedValue(new Error('read only'));

    await expect(
      audit(asRequest(110), 'enquiry.status', { enquiryId: 7 })
    ).resolves.toBeUndefined();
  });
});
