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

const displayNames = new Intl.DisplayNames(['fr'], { type: 'region' });

export interface CountryEntry {
  code: CountryCode;
  /** "+33", "+44", "+1", ... */
  dialCode: string;
  flag: string;
  /** French-language country name from Intl.DisplayNames, e.g. "France". */
  name: string;
}

const all: CountryEntry[] = getCountries().map((code) => {
  const dialCode = `+${getCountryCallingCode(code)}`;
  const flag = countryFlag(code);
  const name = displayNames.of(code) ?? code;
  return { code, dialCode, flag, name };
});

// Surfaced first in the picker: countries that cover the overwhelming majority
// of our student / parent population (France + neighbors + frequent diaspora
// origins). Anything outside this set still appears below, alphabetically.
export const POPULAR_CODES: readonly CountryCode[] = [
  'FR',
  'BE',
  'CH',
  'LU',
  'MC',
  'DE',
  'ES',
  'IT',
  'PT',
  'GB',
  'NL',
  'MA',
  'DZ',
  'TN',
  'SN',
  'CI',
  'CM',
  'US',
];

all.sort((a, b) => a.name.localeCompare(b.name, 'fr'));

export const COUNTRIES: readonly CountryEntry[] = all;
export const DEFAULT_COUNTRY: CountryCode = 'FR';

// Reverse-lookup index for auto-switching when the user types or pastes an
// international prefix. Several countries share a dial code (+1 → US/CA/…);
// the popular-list ordering acts as tie-breaker so "+1 555…" lands on US.
const byDialCode = new Map<string, CountryEntry>();
for (const entry of all) {
  const current = byDialCode.get(entry.dialCode);
  if (!current) {
    byDialCode.set(entry.dialCode, entry);
    continue;
  }
  const currentRank = POPULAR_CODES.indexOf(current.code);
  const entryRank = POPULAR_CODES.indexOf(entry.code);
  const currentScore =
    currentRank === -1 ? Number.POSITIVE_INFINITY : currentRank;
  const entryScore = entryRank === -1 ? Number.POSITIVE_INFINITY : entryRank;
  if (entryScore < currentScore) {
    byDialCode.set(entry.dialCode, entry);
  }
}

export function findCountryByDialCode(
  dialCode: string,
): CountryEntry | undefined {
  return byDialCode.get(dialCode);
}
