import { api } from './api';
import { getDeviceCredential, requireDeviceId, signDeviceChallenge } from './device';

/**
 * The device half of a punch payload.
 *
 * `deviceId` is what the binding has always been matched on. The rest proves
 * the punch really came from the bound device: the public key registers it (and
 * upgrades a device bound before key binding shipped), and the signature answers
 * a single-use server challenge.
 *
 * Only `deviceId` is ever guaranteed. A browser with no credential store, a
 * device not yet keyed, or a challenge request that fails all fall back to
 * sending exactly what punches sent before — which the server accepts until
 * ATTENDANCE_REQUIRE_SIGNED_DEVICE is on. Nothing here may block a punch.
 */
export interface DevicePunchFields {
  deviceId: string;
  devicePublicKey?: string;
  deviceChallenge?: string;
  deviceSignature?: string;
}

async function requestChallenge(): Promise<string | null> {
  try {
    const { data } = await api.post('/attendance/device/challenge');
    return data?.challenge ?? null;
  } catch {
    return null;
  }
}

export async function devicePunchFields(): Promise<DevicePunchFields> {
  // Throws where no device id can be produced at all, which is the existing
  // punch-time behaviour and carries the message the employee needs.
  const deviceId = requireDeviceId();

  const credential = await getDeviceCredential();
  if (!credential) return { deviceId };

  // Null while the server has no key for this device yet — the first punch is
  // what registers it, so there is nothing to sign.
  const challenge = await requestChallenge();
  if (!challenge) return { deviceId, devicePublicKey: credential.publicKey };

  const deviceSignature = await signDeviceChallenge(challenge);
  return deviceSignature
    ? { deviceId, devicePublicKey: credential.publicKey, deviceChallenge: challenge, deviceSignature }
    : { deviceId, devicePublicKey: credential.publicKey };
}
