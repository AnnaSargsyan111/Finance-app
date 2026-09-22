import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Password hashing: scrypt with the OWASP-recommended minimum (N=2^17, r=8, p=1) - see handover 2.4.
 * Better Auth's DEFAULT is N=2^14, r=16, p=1 (about 4x cheaper than the OWASP minimum), which is why we
 * override it via emailAndPassword.password.{hash,verify} (spike item 7, documented in README-backend).
 *
 * Stored format:  scrypt$<N>$<r>$<p>$<saltHex>$<hashHex>   (parameters travel with the hash so they can be raised later).
 */
export const SCRYPT_PARAMS = { N: 2 ** 17, r: 8, p: 1, dkLen: 64, saltBytes: 16 } as const;

function derive(password: string, salt: Buffer, N: number, r: number, p: number, dkLen: number): Promise<Buffer> {
  const opts: ScryptOptions = { N, r, p, maxmem: 128 * N * r * 2 };
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, dkLen, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const { N, r, p, dkLen, saltBytes } = SCRYPT_PARAMS;
  const salt = randomBytes(saltBytes);
  const key = await derive(password, salt, N, r, p, dkLen);
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  const parts = hash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltHex, keyHex] = parts;
  const expected = Buffer.from(keyHex, "hex");
  const key = await derive(password, Buffer.from(saltHex, "hex"), Number(n), Number(r), Number(p), expected.length);
  return key.length === expected.length && timingSafeEqual(key, expected);
}
