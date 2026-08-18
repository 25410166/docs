// Copyright (c) 2026 Casual Office
// SPDX-License-Identifier: Apache-2.0

import {
  CWORD_AUTH_CONFIG,
  resolveCookAppsBaseUrl,
  type AuthConfigOptions,
} from './config.ts';
import {
  createDeviceProofSignature,
  createPkceChallenge,
  exportPrivateKeyJwk,
  generateDeviceKeyPair,
  generateRandomUrlSafeString,
  importPrivateKeyJwk,
  verifyLeaseTokenOffline,
} from './crypto.ts';
import { SecureAuthStore } from './store.ts';
import type {
  DesktopAuthExchangeResponse,
  DesktopAuthStartResponse,
  DesktopSessionResponse,
  LeasePayload,
} from './types.ts';

export class AuthService {
  public static readonly APP_SLUG = CWORD_AUTH_CONFIG.appSlug;
  public static readonly CALLBACK_SCHEME = CWORD_AUTH_CONFIG.callbackScheme;

  private readonly baseUrl: string;
  private readonly leasePublicKeyBase64?: string;

  constructor(opts: AuthConfigOptions = {}) {
    this.baseUrl = resolveCookAppsBaseUrl(opts.baseUrl);
    const envLeasePublicKey =
      typeof process !== 'undefined'
        ? process.env?.VITE_DESKTOP_LEASE_PUBLIC_KEY_BASE64
        : undefined;
    const windowLeasePublicKey =
      typeof window !== 'undefined'
        ? (window as unknown as { __DESKTOP_LEASE_PUBLIC_KEY_BASE64__?: string })
            .__DESKTOP_LEASE_PUBLIC_KEY_BASE64__
        : undefined;
    this.leasePublicKeyBase64 = opts.leasePublicKeyBase64 || envLeasePublicKey || windowLeasePublicKey;
  }

  private getApiPrefix(): string {
    return this.baseUrl;
  }

  /**
   * Safe constant time string comparison for state validation.
   */
  private constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }

  /**
   * Retrieves existing Ed25519 device key pair or generates and stores a new one.
   */
  public async getOrCreateDeviceKeyPair(): Promise<{
    publicKeySpkiBase64: string;
    privateKey: CryptoKey;
  }> {
    const existingSpki = await SecureAuthStore.getDevicePublicKeySpki();
    const existingJwk = await SecureAuthStore.getDevicePrivateKeyJwk();

    if (existingSpki && existingJwk) {
      try {
        const privateKey = await importPrivateKeyJwk(existingJwk);
        return { publicKeySpkiBase64: existingSpki, privateKey };
      } catch {
        // Fallback to generating new key pair if corrupt
      }
    }

    const newKeyPair = await generateDeviceKeyPair();
    const jwk = await exportPrivateKeyJwk(newKeyPair.privateKey);

    await SecureAuthStore.setDevicePublicKeySpki(newKeyPair.publicKeySpkiBase64);
    await SecureAuthStore.setDevicePrivateKeyJwk(jwk);

    return {
      publicKeySpkiBase64: newKeyPair.publicKeySpkiBase64,
      privateKey: newKeyPair.privateKey,
    };
  }

  /**
   * Step 1: Start login flow.
   * Generates PKCE verifier/challenge and state, persists state/verifier, calls POST /api/desktop/auth/start.
   */
  public async startLogin(opts?: {
    replaceDeviceId?: string;
    deviceName?: string;
  }): Promise<DesktopAuthStartResponse> {
    const deviceKey = await SecureAuthStore.getOrCreateDeviceKey();
    const { publicKeySpkiBase64 } = await this.getOrCreateDeviceKeyPair();

    const codeVerifier = generateRandomUrlSafeString(64);
    const codeChallenge = await createPkceChallenge(codeVerifier);
    const state = generateRandomUrlSafeString(32);

    await SecureAuthStore.setPendingState(state);
    await SecureAuthStore.setPendingCodeVerifier(codeVerifier);

    const platform: 'macOS' | 'Windows' =
      typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent || '')
        ? 'macOS'
        : 'Windows';

    const defaultDeviceName = `${platform} PC`;

    const body: Record<string, unknown> = {
      appSlug: AuthService.APP_SLUG,
      deviceKey,
      deviceName: opts?.deviceName || defaultDeviceName,
      platform,
      state,
      codeChallenge,
      publicKeyEd25519: publicKeySpkiBase64,
    };

    if (opts?.replaceDeviceId) {
      body.replaceDeviceId = opts.replaceDeviceId;
    }

    try {
      const res = await fetch(`${this.getApiPrefix()}/api/desktop/auth/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
        body: JSON.stringify(body),
      });

      const data = (await res.json().catch(() => ({}))) as DesktopAuthStartResponse;

      if (!res.ok || !data.success || !data.loginUrl) {
        await SecureAuthStore.clearPendingFlow();
        return {
          success: false,
          loginUrl: '',
          callbackScheme: AuthService.CALLBACK_SCHEME,
          expiresAt: '',
          errorCode: data.errorCode || 'LOGIN_REQUIRED',
          error: data.error || `Start auth failed with status ${res.status}`,
        };
      }

      return data;
    } catch (err: unknown) {
      await SecureAuthStore.clearPendingFlow();
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        loginUrl: '',
        callbackScheme: AuthService.CALLBACK_SCHEME,
        expiresAt: '',
        errorCode: 'LOGIN_REQUIRED',
        error: `Network error connecting to ${this.baseUrl}: ${message}`,
      };
    }
  }

  /**
   * Step 2: Handle deep-link callback (cookapps-cword://auth?code=...&state=...)
   */
  public async handleCallbackUrl(
    urlStr: string
  ): Promise<{ success: boolean; data?: DesktopAuthExchangeResponse; error?: string; errorCode?: string }> {
    try {
      const url = new URL(urlStr);

      if (url.protocol !== `${AuthService.CALLBACK_SCHEME}:`) {
        return { success: false, error: `Invalid callback scheme: ${url.protocol}`, errorCode: 'INVALID_STATE' };
      }

      // Check host or pathname for 'auth'
      const hostOrPath = url.host || url.pathname.replace(/^\/\//, '').replace(/\/$/, '');
      if (hostOrPath !== 'auth') {
        return { success: false, error: 'Invalid callback host/path', errorCode: 'INVALID_STATE' };
      }

      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');

      if (!code || !state) {
        await SecureAuthStore.clearPendingFlow();
        return { success: false, error: 'Callback URL missing code or state parameter', errorCode: 'INVALID_STATE' };
      }

      const storedState = await SecureAuthStore.getPendingState();
      if (!storedState || !this.constantTimeCompare(state, storedState)) {
        await SecureAuthStore.clearPendingFlow();
        return { success: false, error: 'State mismatch - possible CSRF attack', errorCode: 'INVALID_STATE' };
      }

      const codeVerifier = await SecureAuthStore.getPendingCodeVerifier();
      if (!codeVerifier) {
        await SecureAuthStore.clearPendingFlow();
        return { success: false, error: 'Missing pending PKCE code verifier', errorCode: 'PKCE_VERIFICATION_FAILED' };
      }

      const deviceKey = await SecureAuthStore.getOrCreateDeviceKey();
      const exchangeResult = await this.exchangeCode(code, codeVerifier, deviceKey);

      await SecureAuthStore.clearPendingFlow();
      return { success: exchangeResult.success, data: exchangeResult };
    } catch (err: unknown) {
      await SecureAuthStore.clearPendingFlow();
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Callback processing error: ${message}`, errorCode: 'INVALID_STATE' };
    }
  }

  /**
   * Step 3: Exchange code and PKCE verifier for session tokens.
   */
  public async exchangeCode(
    code: string,
    codeVerifier: string,
    deviceKey: string
  ): Promise<DesktopAuthExchangeResponse> {
    const body = { code, codeVerifier, deviceKey };

    try {
      const res = await fetch(`${this.getApiPrefix()}/api/desktop/auth/exchange`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
        body: JSON.stringify(body),
      });

      const data = (await res.json().catch(() => ({}))) as DesktopAuthExchangeResponse;

      if (!res.ok || !data.authenticated || !data.accessToken) {
        return {
          success: false,
          authenticated: false,
          errorCode: data.errorCode || 'INVALID_EXCHANGE_CODE',
          error: data.error || `Exchange failed with status ${res.status}`,
          entitlement: data.entitlement,
          activeDevices: data.activeDevices,
        };
      }

      // Verify lease if returned & lease key configured
      if (data.leaseToken && this.leasePublicKeyBase64) {
        const leaseCheck = await verifyLeaseTokenOffline(data.leaseToken, this.leasePublicKeyBase64);
        if (!leaseCheck.valid) {
          return {
            success: false,
            authenticated: false,
            errorCode: 'LEASE_SIGNING_NOT_CONFIGURED',
            error: `Lease validation failed: ${leaseCheck.error}`,
          };
        }
      }

      // Store tokens securely
      await SecureAuthStore.setDesktopAccessToken(data.accessToken);
      if (data.leaseToken) await SecureAuthStore.setLeaseToken(data.leaseToken);
      if (data.leaseExpiresAt) await SecureAuthStore.setLeaseExpiresAt(data.leaseExpiresAt);
      if (data.leaseGraceUntil) await SecureAuthStore.setLeaseGraceUntil(data.leaseGraceUntil);

      return data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        authenticated: false,
        errorCode: 'INVALID_EXCHANGE_CODE',
        error: `Network error during exchange with ${this.baseUrl}: ${msg}`,
      };
    }
  }

  /**
   * Session verification & device proof (GET /api/desktop/session?appSlug=cword).
   */
  public async verifySession(): Promise<DesktopSessionResponse> {
    const accessToken = await SecureAuthStore.getDesktopAccessToken();
    const deviceKey = await SecureAuthStore.getOrCreateDeviceKey();

    if (!accessToken) {
      return { success: false, authenticated: false, errorCode: 'LOGIN_REQUIRED' };
    }

    const { privateKey } = await this.getOrCreateDeviceKeyPair();
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = generateRandomUrlSafeString(24);

    const signature = await createDeviceProofSignature(privateKey, timestamp, nonce, AuthService.APP_SLUG);

    try {
      const res = await fetch(`${this.getApiPrefix()}/api/desktop/session?appSlug=${AuthService.APP_SLUG}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-CookApps-Device-Key': deviceKey,
          'X-CookApps-Timestamp': String(timestamp),
          'X-CookApps-Nonce': nonce,
          'X-CookApps-Signature': signature,
        },
      });

      const data = (await res.json().catch(() => ({}))) as DesktopSessionResponse;

      if (data.errorCode === 'IP_REAUTH_REQUIRED') {
        // Clear access token and lease token, but keep device key and keypair
        await SecureAuthStore.clearSessionTokens();
        return {
          success: false,
          authenticated: false,
          errorCode: 'IP_REAUTH_REQUIRED',
          error: 'Public IP changed. Online re-authentication required.',
        };
      }

      if (data.errorCode === 'DEVICE_REVOKED') {
        await SecureAuthStore.clearSessionTokens();
        return {
          success: false,
          authenticated: false,
          errorCode: 'DEVICE_REVOKED',
          error: 'Device has been revoked. Please sign in again.',
        };
      }

      if (!res.ok || !data.authenticated) {
        return {
          success: false,
          authenticated: false,
          errorCode: data.errorCode || 'LOGIN_REQUIRED',
          error: data.error || `Session check failed with HTTP ${res.status}`,
        };
      }

      if (data.leaseToken) await SecureAuthStore.setLeaseToken(data.leaseToken);
      if (data.leaseExpiresAt) await SecureAuthStore.setLeaseExpiresAt(data.leaseExpiresAt);
      if (data.leaseGraceUntil) await SecureAuthStore.setLeaseGraceUntil(data.leaseGraceUntil);

      return data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        authenticated: false,
        errorCode: 'LOGIN_REQUIRED',
        error: `Network error verifying session with ${this.baseUrl}: ${msg}`,
      };
    }
  }

  /**
   * Verifies offline lease state based on stored lease token and timestamps.
   */
  public async checkOfflineLease(): Promise<{
    allowed: boolean;
    reason: 'VALID' | 'GRACE_PERIOD' | 'EXPIRED' | 'NO_LEASE' | 'INVALID_SIGNATURE';
    payload?: LeasePayload;
  }> {
    const leaseToken = await SecureAuthStore.getLeaseToken();
    const expiresAt = await SecureAuthStore.getLeaseExpiresAt();
    const graceUntil = await SecureAuthStore.getLeaseGraceUntil();

    if (!leaseToken || !expiresAt) {
      return { allowed: false, reason: 'NO_LEASE' };
    }

    if (this.leasePublicKeyBase64) {
      const verifyRes = await verifyLeaseTokenOffline(leaseToken, this.leasePublicKeyBase64);
      if (!verifyRes.valid || !verifyRes.payload) {
        return { allowed: false, reason: 'INVALID_SIGNATURE' };
      }

      if (!verifyRes.payload.app_entitlements.includes(AuthService.APP_SLUG) || !verifyRes.payload.entitlement_allowed) {
        return { allowed: false, reason: 'EXPIRED', payload: verifyRes.payload };
      }

      const nowSec = Math.floor(Date.now() / 1000);
      if (nowSec <= expiresAt) {
        return { allowed: true, reason: 'VALID', payload: verifyRes.payload };
      }

      const effectiveGrace = graceUntil || verifyRes.payload.grace_until;
      if (nowSec <= effectiveGrace) {
        return { allowed: true, reason: 'GRACE_PERIOD', payload: verifyRes.payload };
      }

      return { allowed: false, reason: 'EXPIRED', payload: verifyRes.payload };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec <= expiresAt) {
      return { allowed: true, reason: 'VALID' };
    }
    if (graceUntil && nowSec <= graceUntil) {
      return { allowed: true, reason: 'GRACE_PERIOD' };
    }

    return { allowed: false, reason: 'EXPIRED' };
  }
}
