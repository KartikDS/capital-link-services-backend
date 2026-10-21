import {
  ENQUIRY_STATUSES,
  readEnquiryStatus,
  storedValuesFor,
} from '../../src/domain/enquiryStatus';

describe('enquiry status', () => {
  it('offers the five pipeline stages in order', () => {
    expect(ENQUIRY_STATUSES).toEqual(['new', 'contacted', 'quoted', 'won', 'lost']);
  });

  it('reads the older vocabulary as the nearest stage', () => {
    expect(readEnquiryStatus('in-progress')).toBe('contacted');
    expect(readEnquiryStatus('converted')).toBe('won');
    expect(readEnquiryStatus('closed')).toBe('lost');
  });

  it('reads blank, null and unknown values as new', () => {
    expect(readEnquiryStatus('')).toBe('new');
    expect(readEnquiryStatus(null)).toBe('new');
    expect(readEnquiryStatus('answered')).toBe('new');
  });

  it('ignores case and padding on a stored value', () => {
    expect(readEnquiryStatus('  Quoted ')).toBe('quoted');
  });

  it('filters on the stage and every older value that reads as it', () => {
    expect(storedValuesFor('contacted')).toEqual(['contacted', 'in-progress']);
    expect(storedValuesFor('quoted')).toEqual(['quoted']);
  });
});
