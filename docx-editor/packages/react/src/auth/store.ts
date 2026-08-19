// Copyright (c) 2026 Casual Office
// SPDX-License-Identifier: Apache-2.0

import { generateRandomUrlSafeString } from './crypto.ts';

type DesktopAuthBridge = {
  tokenGet?: (key: string) => Promise<string | null>;
  tokenSet?: (key: string, value: string) => Promise<void>;
};

export class SecureAuthStore {
  private static prefix = 'cword.';
  private static memoryStore = new Map<string, string>();

  private static async getRaw(key: string): Promise<string | null> {
    const fullKey = `${SecureAuthStore.prefix}${key}`;
    const desktopBridge =
      typeof window !== 'undefined'
        ? (window as Window & { __deskApp__?: DesktopAuthBridge }).__deskApp__
        : undefined;
    if (desktopBridge?.tokenGet) {
      try {
        const val = await desktopBridge.tokenGet(fullKey);
        if (val) return val;

        if (typeof localStorage !== 'undefined') {
          try {
            const legacyValue = localStorage.getItem(fullKey);
            if (legacyValue) {
              await desktopBridge.tokenSet?.(fullKey, legacyValue);
              localStorage.removeItem(fullKey);
              return legacyValue;
            }
          } catch {}
        }

        return null;
      } catch {}
    }
    if (typeof localStorage !== 'undefined') {
      try {
        return localStorage.getItem(fullKey);
      } catch {}
    }
    return SecureAuthStore.memoryStore.get(fullKey) || null;
  }

  private static async setRaw(key: string, value: string | null): Promise<void> {
    const fullKey = `${SecureAuthStore.prefix}${key}`;
    if (value === null) {
      SecureAuthStore.memoryStore.delete(fullKey);
    } else {
      SecureAuthStore.memoryStore.set(fullKey, value);
    }

    const desktopBridge =
      typeof window !== 'undefined'
        ? (window as Window & { __deskApp__?: DesktopAuthBridge }).__deskApp__
        : undefined;
    if (desktopBridge?.tokenSet) {
      try {
        await desktopBridge.tokenSet(fullKey, value ?? '');
        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.removeItem(fullKey);
          } catch {}
        }
        return;
      } catch {}
    }

    if (typeof localStorage !== 'undefined') {
      try {
        if (value === null) {
          localStorage.removeItem(fullKey);
        } else {
          localStorage.setItem(fullKey, value);
        }
        return;
      } catch {}
    }
  }

  /**
   * Loads or creates a stable installation device key matching ^[A-Za-z0-9._:-]{8,160}$
   * Preserved across restarts; never uses public IP, never re-generated per session.
   */
  public static async getOrCreateDeviceKey(): Promise<string> {
    let key = await SecureAuthStore.getRaw('deviceKey');
    if (!key) {
      const uuid =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : generateRandomUrlSafeString(32);
      key = `cword-${uuid}`;
      await SecureAuthStore.setRaw('deviceKey', key);
    }
    return key;
  }

  public static async getDevicePrivateKeyJwk(): Promise<JsonWebKey | null> {
    const raw = await SecureAuthStore.getRaw('devicePrivateKey');
    return raw ? (JSON.parse(raw) as JsonWebKey) : null;
  }

  public static async setDevicePrivateKeyJwk(jwk: JsonWebKey): Promise<void> {
    await SecureAuthStore.setRaw('devicePrivateKey', JSON.stringify(jwk));
  }

  public static async getDevicePublicKeySpki(): Promise<string | null> {
    return await SecureAuthStore.getRaw('devicePublicKey');
  }

  public static async setDevicePublicKeySpki(spkiBase64: string): Promise<void> {
    await SecureAuthStore.setRaw('devicePublicKey', spkiBase64);
  }

  public static async getPendingState(): Promise<string | null> {
    return await SecureAuthStore.getRaw('pending.state');
  }

  public static async setPendingState(state: string | null): Promise<void> {
    await SecureAuthStore.setRaw('pending.state', state);
  }

  public static async getPendingCodeVerifier(): Promise<string | null> {
    return await SecureAuthStore.getRaw('pending.codeVerifier');
  }

  public static async setPendingCodeVerifier(verifier: string | null): Promise<void> {
    await SecureAuthStore.setRaw('pending.codeVerifier', verifier);
  }

  public static async clearPendingFlow(): Promise<void> {
    await SecureAuthStore.setPendingState(null);
    await SecureAuthStore.setPendingCodeVerifier(null);
  }

  public static async getDesktopAccessToken(): Promise<string | null> {
    return await SecureAuthStore.getRaw('desktopAccessToken');
  }

  public static async setDesktopAccessToken(token: string | null): Promise<void> {
    await SecureAuthStore.setRaw('desktopAccessToken', token);
  }

  public static async getLeaseToken(): Promise<string | null> {
    return await SecureAuthStore.getRaw('leaseToken');
  }

  public static async setLeaseToken(leaseToken: string | null): Promise<void> {
    await SecureAuthStore.setRaw('leaseToken', leaseToken);
  }

  public static async getLeaseExpiresAt(): Promise<number | null> {
    const raw = await SecureAuthStore.getRaw('leaseExpiresAt');
    return raw ? parseInt(raw, 10) : null;
  }

  public static async setLeaseExpiresAt(timestampSec: number | null): Promise<void> {
    await SecureAuthStore.setRaw(
      'leaseExpiresAt',
      timestampSec !== null ? String(timestampSec) : null
    );
  }

  public static async getLeaseGraceUntil(): Promise<number | null> {
    const raw = await SecureAuthStore.getRaw('leaseGraceUntil');
    return raw ? parseInt(raw, 10) : null;
  }

  public static async setLeaseGraceUntil(timestampSec: number | null): Promise<void> {
    await SecureAuthStore.setRaw(
      'leaseGraceUntil',
      timestampSec !== null ? String(timestampSec) : null
    );
  }

  public static async clearSessionTokens(): Promise<void> {
    await SecureAuthStore.setDesktopAccessToken(null);
    await SecureAuthStore.setLeaseToken(null);
    await SecureAuthStore.setLeaseExpiresAt(null);
    await SecureAuthStore.setLeaseGraceUntil(null);
  }
}
