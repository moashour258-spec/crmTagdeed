import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

const GOVERNORATES = new Set([
  "01", "02", "03", "04",
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "23", "24", "25", "26", "27", "28", "29",
  "31", "32", "33", "34", "35",
  "88",
]);

function keyBytes(value: string) {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error("key must be 32 bytes");
  }
  return key;
}

export function validateNationalId(value: string) {
  if (!/^\d{14}$/.test(value)) return false;
  if (value[0] !== "2" && value[0] !== "3") return false;
  const year = (value[0] === "2" ? 1900 : 2000) + Number(value.slice(1, 3));
  const month = Number(value.slice(3, 5));
  const day = Number(value.slice(5, 7));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return false;
  }
  return GOVERNORATES.has(value.slice(7, 9));
}

export function maskNationalId(value: string) {
  return `${value.slice(0, 2)}**********${value.slice(-2)}`;
}

export function hashNationalId(value: string, hashKey: string) {
  return createHmac("sha256", keyBytes(hashKey)).update(value).digest("hex");
}

export function encryptNationalId(value: string, encryptionKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(encryptionKey), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64")).join(".");
}

export function decryptNationalId(payload: string, encryptionKey: string) {
  const [iv, tag, ciphertext] = payload.split(".");
  if (!iv || !tag || !ciphertext) {
    throw new Error("invalid payload");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    keyBytes(encryptionKey),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
