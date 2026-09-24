import { describe, expect, it } from 'vitest';
import { isValidEmail } from '@/utils/email';
import { getPropertyFormatErrorKey } from '@/utils/propertyValidation';

describe('isValidEmail', () => {
  it.each(['user@example.com', 'first.last+tag@sub.domain.org', '  padded@example.io  '])(
    'accepts %s',
    (value) => {
      expect(isValidEmail(value)).toBe(true);
    },
  );

  it.each(['', 'plainaddress', 'user@', '@example.com', 'user@example', 'user@exa mple.com'])(
    'rejects %s',
    (value) => {
      expect(isValidEmail(value)).toBe(false);
    },
  );
});

describe('getPropertyFormatErrorKey', () => {
  it('returns null for properties without a format validator', () => {
    expect(getPropertyFormatErrorKey('name', 'anything goes')).toBeNull();
  });

  it('skips empty values because "required" is validated separately', () => {
    expect(getPropertyFormatErrorKey('email', '')).toBeNull();
    expect(getPropertyFormatErrorKey('email', '   ')).toBeNull();
    expect(getPropertyFormatErrorKey('email', null)).toBeNull();
    expect(getPropertyFormatErrorKey('email', undefined)).toBeNull();
  });

  it('returns null for valid values', () => {
    expect(getPropertyFormatErrorKey('email', 'sales@relativa.com')).toBeNull();
    expect(getPropertyFormatErrorKey('phone', '+380 (44) 123-45-67')).toBeNull();
    expect(getPropertyFormatErrorKey('website', 'https://relativa.com')).toBeNull();
  });

  it('returns the i18n key matching the property for invalid values', () => {
    expect(getPropertyFormatErrorKey('email', 'not-an-email')).toBe('entityForm.invalidEmail');
    expect(getPropertyFormatErrorKey('phone', 'call me')).toBe('entityForm.invalidPhone');
    expect(getPropertyFormatErrorKey('website', 'relativa.com')).toBe('entityForm.invalidWebsite');
  });

  it('maps phone_number to the shared Phone message', () => {
    expect(getPropertyFormatErrorKey('phone_number', '12')).toBe('entityForm.invalidPhone');
  });
});
