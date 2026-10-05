// Minimal ULID generator (Crockford base32, 48-bit time + 80-bit randomness).

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function ulid(now: number = Date.now()): string {
  let time = now;
  const timeChars = new Array<string>(10);
  for (let i = 9; i >= 0; i--) {
    timeChars[i] = ENCODING[time % 32] as string;
    time = Math.floor(time / 32);
  }
  const rand = new Uint8Array(16);
  crypto.getRandomValues(rand);
  let out = timeChars.join('');
  for (let i = 0; i < 16; i++) {
    out += ENCODING[(rand[i] as number) % 32];
  }
  return out;
}
