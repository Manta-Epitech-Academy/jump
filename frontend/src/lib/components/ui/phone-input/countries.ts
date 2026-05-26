import {
  getCountries,
  getCountryCallingCode,
  type CountryCode,
} from 'libphonenumber-js';

/** ISO 3166-1 → regional indicator emoji flag */
function countryFlag(code: CountryCode): string {
  return [...code]
    .map((c) => String.fromCodePoint(0x1f1e6 - 65 + c.charCodeAt(0)))
    .join('');
}

export interface CountryEntry {
  code: CountryCode;
  dialCode: string;
  flag: string;
  label: string; // e.g. "🇫🇷 +33"
}

const all: CountryEntry[] = getCountries().map((code) => {
  const dialCode = `+${getCountryCallingCode(code)}`;
  const flag = countryFlag(code);
  return { code, dialCode, flag, label: `${flag} ${dialCode}` };
});

// France first, then sorted by dial code
all.sort((a, b) => {
  if (a.code === 'FR') return -1;
  if (b.code === 'FR') return 1;
  return a.dialCode.localeCompare(b.dialCode, undefined, { numeric: true });
});

export const COUNTRIES: readonly CountryEntry[] = all;

export const DEFAULT_COUNTRY: CountryCode = 'FR';
