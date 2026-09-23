import { describe, expect, it } from 'vitest';
import { firstFieldError, hasFieldErrors, normalizeError, parseValidationDetail } from '@/api/errors';
import { ApiError } from '@/api/http';

describe('parseValidationDetail', () => {
  it('splits the FluentValidation "Field: msg; Field2: msg" detail into camelCase fields', () => {
    expect(parseValidationDetail('Email: Email is required; Password: Too short')).toEqual({
      email: ['Email is required'],
      password: ['Too short'],
    });
  });

  it('groups several messages for the same field', () => {
    expect(parseValidationDetail('Name: Required; Name: Too long')).toEqual({
      name: ['Required', 'Too long'],
    });
  });

  it('keeps messages without a field under the "_" sentinel', () => {
    expect(parseValidationDetail('Something went wrong')).toEqual({ _: ['Something went wrong'] });
  });

  it('returns an empty map for empty input', () => {
    expect(parseValidationDetail(null)).toEqual({});
    expect(parseValidationDetail('')).toEqual({});
  });
});

describe('normalizeError', () => {
  it('maps a 400 validation response to field errors and status flags', () => {
    const detail = 'Email: Email is required';
    const err = new ApiError(400, detail, { status: 400, title: 'Validation failed', detail });

    const normalized = normalizeError(err);

    expect(normalized.status).toBe(400);
    expect(normalized.isValidation).toBe(true);
    expect(normalized.fieldErrors).toEqual({ email: ['Email is required'] });
    expect(normalized.message).toBe('Validation failed');
    expect(normalized.isServer).toBe(false);
  });

  it('prefers the server detail message for non-validation errors', () => {
    const err = new ApiError(409, 'Organization name is taken', {
      status: 409,
      title: 'Conflict',
      detail: 'Organization name is taken',
    });

    const normalized = normalizeError(err);

    expect(normalized.isConflict).toBe(true);
    expect(normalized.message).toBe('Organization name is taken');
    expect(hasFieldErrors(normalized.fieldErrors)).toBe(false);
  });

  it('falls back to the localized status message when the server sent nothing useful', () => {
    const normalized = normalizeError(new ApiError(503, '', undefined));

    expect(normalized.isServer).toBe(true);
    expect(normalized.message).toBe('The service is unavailable. Please try again later.');
  });

  it('flags fetch failures as network errors', () => {
    const normalized = normalizeError(new TypeError('Failed to fetch'));

    expect(normalized.status).toBeNull();
    expect(normalized.isNetwork).toBe(true);
    expect(normalized.message).toBe('Network error. Please check your connection and try again.');
  });

  it('uses the provided fallback for unknown values', () => {
    expect(normalizeError('boom', 'Custom fallback').message).toBe('Custom fallback');
  });
});

describe('field error helpers', () => {
  it('returns the first message for a field or null', () => {
    const errors = { email: ['first', 'second'] };
    expect(firstFieldError(errors, 'email')).toBe('first');
    expect(firstFieldError(errors, 'password')).toBeNull();
  });
});
