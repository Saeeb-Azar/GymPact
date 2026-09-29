import { describe, expect, it } from 'vitest';
import { isValidProductCode } from './barcode';

describe('isValidProductCode', () => {
  it('akzeptiert gültige EAN-13/EAN-8/UPC-A', () => {
    expect(isValidProductCode('4006381333931')).toBe(true); // EAN-13
    expect(isValidProductCode('96385074')).toBe(true); // EAN-8
    expect(isValidProductCode('036000291452')).toBe(true); // UPC-A
  });
  it('lehnt falsche Prüfziffer und Unsinn ab', () => {
    expect(isValidProductCode('4006381333932')).toBe(false);
    expect(isValidProductCode('12345')).toBe(false);
    expect(isValidProductCode('abcdefghijklm')).toBe(false);
  });
});
