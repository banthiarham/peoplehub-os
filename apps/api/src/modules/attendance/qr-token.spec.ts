/** The signature and the clock are the whole of a code's trustworthiness. */
import {
  QR_ACCEPT_MS,
  QR_ROTATE_MS,
  QR_TOKEN_PREFIX,
  signQrToken,
  verifyQrToken,
} from './qr-token';

const SECRET = 'secret-one';
const OTHER = 'secret-two';
const BASE = { t: 'tenant-1', l: 'loc-1', d: 'display-1' };

describe('qr token', () => {
  it('round trips the fields the punch path needs', () => {
    const { payload } = verifyQrToken(signQrToken(BASE, SECRET), [SECRET]);

    expect(payload).toMatchObject(BASE);
    expect(typeof payload!.i).toBe('number');
  });

  it('gives two codes issued in the same second different bodies', () => {
    const at = Math.floor(Date.now() / 1000);

    expect(signQrToken({ ...BASE, i: at }, SECRET)).not.toBe(signQrToken({ ...BASE, i: at }, SECRET));
  });

  it('refuses a signature from a different secret', () => {
    expect(verifyQrToken(signQrToken(BASE, OTHER), [SECRET])).toEqual({ failure: 'signature' });
  });

  it('refuses a tampered payload', () => {
    const [prefix, body, sig] = signQrToken(BASE, SECRET).split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...BASE, l: 'loc-somewhere-else', i: Math.floor(Date.now() / 1000), n: 'x' }),
    ).toString('base64url');

    expect(verifyQrToken(`${prefix}.${forged}.${sig}`, [SECRET])).toEqual({ failure: 'signature' });
  });

  it('rejects anything that is not a signed code', () => {
    for (const junk of ['PHUB:loc-1', '', 'not.a.token', `${QR_TOKEN_PREFIX}.only-two`]) {
      expect(verifyQrToken(junk, [SECRET]).payload).toBeUndefined();
    }
  });

  describe('acceptance window', () => {
    const issued = new Date('2026-08-09T10:00:00.000Z');
    const token = signQrToken({ ...BASE, i: Math.floor(issued.getTime() / 1000) }, SECRET);
    const at = (offsetMs: number) => new Date(issued.getTime() + offsetMs);

    it('is 30 seconds, three rotations wide', () => {
      // Pinned: the window is the exposure of a photographed code relayed
      // offsite, so widening it is a security decision, not a tuning one.
      expect(QR_ROTATE_MS).toBe(10_000);
      expect(QR_ACCEPT_MS).toBe(30_000);
    });

    it('accepts a code from the rotation before last', () => {
      // The realistic worst case: someone starts scanning as the code changes.
      expect(verifyQrToken(token, [SECRET], at(2 * QR_ROTATE_MS)).payload).toBeDefined();
    });

    it('accepts a code inside the window', () => {
      expect(verifyQrToken(token, [SECRET], at(QR_ACCEPT_MS - 1_000)).payload).toBeDefined();
    });

    it('refuses one past it', () => {
      expect(verifyQrToken(token, [SECRET], at(QR_ACCEPT_MS + 1_000))).toEqual({
        failure: 'expired',
      });
    });

    it('refuses one from the future, which only a moved clock produces', () => {
      expect(verifyQrToken(token, [SECRET], at(-(QR_ACCEPT_MS + 1_000)))).toEqual({
        failure: 'expired',
      });
    });

    it('reports a tampered code as forged rather than merely stale', () => {
      // "expired" would send an employee to rescan a code that was never valid.
      const stale = signQrToken({ ...BASE, i: 0 }, OTHER);

      expect(verifyQrToken(stale, [SECRET])).toEqual({ failure: 'signature' });
    });
  });

  it('accepts the previous secret during a rotation', () => {
    const beforeRotation = signQrToken(BASE, OTHER);

    expect(verifyQrToken(beforeRotation, [SECRET, OTHER]).payload).toMatchObject(BASE);
    expect(verifyQrToken(beforeRotation, [SECRET])).toEqual({ failure: 'signature' });
  });
});
