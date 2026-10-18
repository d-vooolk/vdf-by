import crypto from "node:crypto";
import { Transform, type TransformCallback } from "node:stream";

export const PANIC_MAGIC = Buffer.from("PCRMPANIC1", "ascii");
const KEY_LEN = 32;
const IV_LEN = 12;
const HKDF_INFO = Buffer.from("prime-crm panic v1", "ascii");

const SPKI_PREFIX = Buffer.from("302a300506032b656e032100", "hex");

export function parseHexKey(text: string, what: string): Buffer {
  const hex = text.replace(/[\s-]/g, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error(`${what}: нужно ровно 64 символа 0-9 и a-f`);
  return Buffer.from(hex, "hex");
}

const publicKeyObject = (raw: Buffer) =>
  crypto.createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw]), format: "der", type: "spki" });

const rawPublic = (key: crypto.KeyObject) =>
  Buffer.from(key.export({ format: "der", type: "spki" })).subarray(SPKI_PREFIX.length);

function deriveKey(shared: Buffer, ephemeralPub: Buffer, recipientPub: Buffer): Buffer {
  const salt = Buffer.concat([ephemeralPub, recipientPub]);
  return Buffer.from(crypto.hkdfSync("sha256", shared, salt, HKDF_INFO, KEY_LEN));
}

export function createPanicEncryptStream(recipientPublicKeyHex: string): Transform {
  const recipientPub = parseHexKey(recipientPublicKeyHex, "Открытый ключ");
  const ephemeral = crypto.generateKeyPairSync("x25519");
  const ephemeralPub = rawPublic(ephemeral.publicKey);
  const shared = crypto.diffieHellman({
    privateKey: ephemeral.privateKey,
    publicKey: publicKeyObject(recipientPub),
  });
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(shared, ephemeralPub, recipientPub), iv);
  let headerSent = false;

  return new Transform({
    transform(chunk: Buffer, _enc, cb: TransformCallback) {
      if (!headerSent) {
        this.push(Buffer.concat([PANIC_MAGIC, recipientPub, ephemeralPub, iv]));
        headerSent = true;
      }
      cb(null, cipher.update(chunk));
    },
    flush(cb: TransformCallback) {
      if (!headerSent) this.push(Buffer.concat([PANIC_MAGIC, recipientPub, ephemeralPub, iv]));
      this.push(cipher.final());
      cb(null, cipher.getAuthTag());
    },
  });
}

export function panicKeyUsable(publicKeyHex: string): boolean {
  try {
    parseHexKey(publicKeyHex, "Открытый ключ");
    return true;
  } catch {
    return false;
  }
}

export function verifyPanicPin(pin: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex || !/^[0-9a-f]+$/i.test(saltHex + hashHex)) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(pin, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}
