import { adminErrorMessage, isRetryableErrorCode, isSessionErrorCode, validationDetails, validationSummary } from './error-codes';

describe('adminErrorMessage', () => {
  it('prefers our wording where we deliberately override', () => {
    expect(adminErrorMessage('SERVICE_BUSY', 'The service is busy. Please try again in a moment.')).toMatch(
      /retry automatically/,
    );
  });

  it('falls back to the server message for the hundred-odd domain codes we do not map', () => {
    expect(adminErrorMessage('PAYOUT_EXCEEDS_BALANCE', 'Payout exceeds the available balance')).toBe(
      'Payout exceeds the available balance',
    );
    expect(adminErrorMessage('SOME_FUTURE_CODE', 'A brand new backend error')).toBe('A brand new backend error');
  });

  it('never shows an empty dialog', () => {
    expect(adminErrorMessage(undefined, undefined)).toBe('Something went wrong.');
    expect(adminErrorMessage('WEIRD', '   ')).toBe('Something went wrong.');
  });
});

describe('error code classification', () => {
  it('knows what is worth retrying', () => {
    expect(isRetryableErrorCode('SERVICE_BUSY')).toBe(true);
    expect(isRetryableErrorCode('RATE_LIMITED')).toBe(true);
    expect(isRetryableErrorCode('NOT_FOUND')).toBe(false);
    expect(isRetryableErrorCode(undefined)).toBe(false);
  });

  it('knows what ends the session', () => {
    expect(isSessionErrorCode('UNAUTHENTICATED')).toBe(true);
    expect(isSessionErrorCode('CSRF_ORIGIN')).toBe(true);
    // FORBIDDEN means "signed in, wrong role": re-logging in would not help, so it is not a session error.
    expect(isSessionErrorCode('FORBIDDEN')).toBe(false);
  });
});

describe('validationDetails', () => {
  it('reads the shape the API actually sends', () => {
    const details = [{ field: 'phone', messages: ['phone must be longer than or equal to 10 characters'] }];
    expect(validationDetails(details)).toEqual([
      { field: 'phone', messages: ['phone must be longer than or equal to 10 characters'] },
    ]);
  });

  it('tolerates a bare string or an array of strings', () => {
    expect(validationDetails('Request failed validation')).toEqual([
      { field: '', messages: ['Request failed validation'] },
    ]);
    expect(validationDetails(['a', 'b'])).toEqual([
      { field: '', messages: ['a'] },
      { field: '', messages: ['b'] },
    ]);
  });

  it('drops entries it cannot use instead of throwing', () => {
    expect(validationDetails([{ field: 'x' }, { messages: ['y'] }, null, 42])).toEqual([]);
    expect(validationDetails(undefined)).toEqual([]);
    expect(validationDetails({ not: 'an array' })).toEqual([]);
  });

  it('summarises for a toast', () => {
    expect(
      validationSummary([
        { field: 'ratePct', messages: ['must not be greater than 100'] },
        { field: 'scope', messages: ['invalid value'] },
      ]),
    ).toBe('ratePct: must not be greater than 100 · scope: invalid value');
    expect(validationSummary(undefined)).toBe('');
  });
});
