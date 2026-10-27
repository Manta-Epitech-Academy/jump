/**
 * Where the generator puts the bytes of the pictures it seeds.
 *
 * A seeded picture is a row and the object it names, the way the application's
 * own writer leaves it: `write_workshop` never stores a key without its bytes,
 * so a key with nothing behind it is a state no admin can produce, and a page
 * whose cards lead with a picture (the subject catalogue) could only ever be
 * reviewed through its fallback.
 *
 * The bucket is the one the application reads (`s3Settings`, the same
 * variables from the same `.env`), and a re-seed writes the same keys again, so
 * it leaves nothing behind. Two cases store nothing, and say so in the run's
 * log rather than failing:
 *
 *   - the `test` target, which is a suite's disposable database: nothing serves
 *     its pictures, and `test:seed` runs inside `verify`, which must not depend
 *     on a local bucket being up, nor write to the one a developer's own
 *     environment reads;
 *   - an environment with no `S3_*` connection, such as a checkout that never
 *     started its storage. Its pages show the fallback a missing picture gets.
 *
 * The rows are written either way, with the size the stored bytes have, so the
 * two differ by the objects alone.
 */

import { putObject, s3Client, s3Settings } from '../../src/lib/server/infra/s3';
import type { SeedTarget } from './guard';

export type SeedStorage = {
  /** Where the bytes go, for the run's log. */
  readonly label: string;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
};

export type SeedStorageChoice =
  | { readonly storage: SeedStorage }
  | { readonly storage: null; readonly why: string };

export function openSeedStorage(target: SeedTarget): SeedStorageChoice {
  if (target === 'test') {
    return {
      storage: null,
      why: 'la cible test est la base jetable d’une suite',
    };
  }
  const settings = s3Settings(process.env);
  if (
    !settings.endpoint ||
    !settings.accessKeyId ||
    !settings.secretAccessKey
  ) {
    return {
      storage: null,
      why: 'aucun stockage S3 configuré (S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)',
    };
  }
  const client = s3Client(settings, settings.endpoint);
  return {
    storage: {
      label: `${settings.bucket} sur ${settings.endpoint}`,
      put: (key, bytes, contentType) =>
        putObject(client, settings.bucket, key, bytes, contentType),
    },
  };
}
