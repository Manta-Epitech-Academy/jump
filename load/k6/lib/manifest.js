import { SharedArray } from 'k6/data';
import { fail } from 'k6';

// Loads load/data.json into a SharedArray (zero per-VU copy cost).
// Run `bun load/scripts/manifest.ts` to (re)generate it.
export const manifest = new SharedArray('manifest', () => {
  try {
    return [JSON.parse(open('../../data.json'))];
  } catch (e) {
    fail(
      'Missing load/data.json: run `bun load/scripts/manifest.ts` first.\n' + e,
    );
  }
});

export function data() {
  return manifest[0];
}

// Round-robin sampler. Use a different `salt` (string) per call-site if you
// want VUs to spread across different slices of the same array.
export function pick(arr, salt = '') {
  if (!arr || arr.length === 0) fail(`pick: empty array (${salt})`);
  const idx = (__VU + hash(salt) + __ITER) % arr.length;
  return arr[idx];
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
