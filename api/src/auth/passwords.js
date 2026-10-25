import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';

export const hashPassword = (plain) => argon2.hash(plain, { type: argon2.argon2id });

export async function verifyPassword(hash, plain) {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

// Used when the email is unknown so login timing does not reveal account existence.
let dummyHash;
export async function burnPasswordCheck(plain) {
  dummyHash ??= await hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword(dummyHash, plain);
}

/** One-time temporary password for admin-created members (shown once). */
export const generateTemporaryPassword = () => randomBytes(12).toString('base64url');
