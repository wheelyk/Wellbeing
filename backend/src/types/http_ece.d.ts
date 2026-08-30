// `http_ece` ships no types of its own. Only the test that decrypts a real push payload uses it
// (see lib/reminderDelivery.test.ts), and only for `decrypt` - so this declares exactly that,
// rather than pulling in a dependency to describe a library used in one place.
declare module "http_ece" {
  export function decrypt(
    buffer: Buffer,
    options: {
      version?: string;
      privateKey?: unknown;
      // Buffers in practice - the keys come straight from crypto, not from strings.
      dh?: string | Buffer;
      salt?: string | Buffer;
      authSecret?: string | Buffer;
    },
  ): Buffer;
}
