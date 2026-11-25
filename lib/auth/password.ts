const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function generatePassword(length = 16) {
  const chars: string[] = [];
  const limit = 256 - (256 % alphabet.length);
  while (chars.length < length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= limit) continue;
      chars.push(alphabet[byte % alphabet.length]);
      if (chars.length === length) break;
    }
  }
  return chars.join("");
}

export function isStrongPassword(value: string) {
  return value.length >= 10;
}
