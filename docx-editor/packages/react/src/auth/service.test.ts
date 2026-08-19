// Copyright (c) 2026 Casual Office
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { AuthService } from './service.ts';
import { SecureAuthStore } from './store.ts';

describe('CWord AuthService Integration', () => {
  let authService: AuthService;

  beforeEach(async () => {
    await SecureAuthStore.clearPendingFlow();
    await SecureAuthStore.clearSessionTokens();
    authService = new AuthService({ baseUrl: 'https://cookapps.net' });
  });

  it('uses appSlug = cword strictly', () => {
    expect(AuthService.APP_SLUG).toBe('cword');
    expect(AuthService.CALLBACK_SCHEME).toBe('cookapps-cword');
  });

  it('starts login flow and posts correct appSlug and parameters', async () => {
    const mockFetch = mock().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        loginUrl: 'https://cookapps.net/desktop-login?request=req_123',
        callbackScheme: 'cookapps-cword',
        expiresAt: '2026-08-18T18:00:00.000Z',
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const res = await authService.startLogin();

    expect(res.success).toBe(true);
    expect(res.loginUrl).toBe('https://cookapps.net/desktop-login?request=req_123');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://cookapps.net/api/desktop/auth/start');

    const body = JSON.parse(init.body as string);
    expect(body.appSlug).toBe('cword');
    expect(body.deviceKey).toMatch(/^cword-/);
    expect(body.codeChallenge).toBeDefined();
    expect(body.publicKeyEd25519).toBeDefined();
    expect(body.state).toBeDefined();

    // Verify state and verifier were stored securely before browser open
    expect(await SecureAuthStore.getPendingState()).toBe(body.state);
    expect(await SecureAuthStore.getPendingCodeVerifier()).toBeDefined();
  });

  it('handles valid callback URL cookapps-cword://auth?code=...&state=...', async () => {
    const state = 'valid-state-1234567890';
    const verifier = 'valid-code-verifier-1234567890';
    await SecureAuthStore.setPendingState(state);
    await SecureAuthStore.setPendingCodeVerifier(verifier);

    const mockFetch = mock().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        authenticated: true,
        accessToken: 'cword-access-token-777',
        leaseToken: 'lease.sig',
        leaseExpiresAt: 1755550000,
        leaseGraceUntil: 1755600000,
        user: { userId: 'u1', email: 'test@example.com', name: 'Test User' },
        entitlement: { allowed: true, isFree: true },
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const callbackUrl = `cookapps-cword://auth?code=one-time-code-99&state=${state}`;
    const result = await authService.handleCallbackUrl(callbackUrl);

    expect(result.success).toBe(true);
    expect(result.data?.authenticated).toBe(true);
    expect(await SecureAuthStore.getDesktopAccessToken()).toBe('cword-access-token-777');

    // Pending flow cleared
    expect(await SecureAuthStore.getPendingState()).toBeNull();
  });

  it('rejects callback with invalid scheme or mismatched state', async () => {
    await SecureAuthStore.setPendingState('expected-state');
    await SecureAuthStore.setPendingCodeVerifier('expected-verifier');

    const wrongSchemeResult = await authService.handleCallbackUrl(
      'wrong-scheme://auth?code=123&state=expected-state'
    );
    expect(wrongSchemeResult.success).toBe(false);

    const wrongStateResult = await authService.handleCallbackUrl(
      'cookapps-cword://auth?code=123&state=wrong-state'
    );
    expect(wrongStateResult.success).toBe(false);
    expect(wrongStateResult.errorCode).toBe('INVALID_STATE');

    // Pending flow cleared on state mismatch
    expect(await SecureAuthStore.getPendingState()).toBeNull();
  });

  it('sends device proof headers on verifySession for appSlug=cword', async () => {
    await SecureAuthStore.setDesktopAccessToken('test-access-token');

    const mockFetch = mock().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        authenticated: true,
        user: { userId: 'u1', email: 'user@test.com', name: 'User' },
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const sessionRes = await authService.verifySession();

    expect(sessionRes.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://cookapps.net/api/desktop/session?appSlug=cword');
    expect(init.headers['Authorization']).toBe('Bearer test-access-token');
    expect(init.headers['X-CookApps-Device-Key']).toMatch(/^cword-/);
    expect(init.headers['X-CookApps-Timestamp']).toBeDefined();
    expect(init.headers['X-CookApps-Nonce']).toBeDefined();
    expect(init.headers['X-CookApps-Signature']).toBeDefined();
  });

  it('clears tokens and returns IP_REAUTH_REQUIRED when IP changes', async () => {
    await SecureAuthStore.setDesktopAccessToken('test-token');
    await SecureAuthStore.setLeaseToken('test-lease');

    const mockFetch = mock().mockResolvedValue({
      ok: false,
      json: async () => ({
        success: false,
        authenticated: false,
        errorCode: 'IP_REAUTH_REQUIRED',
        error: 'IP changed',
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const res = await authService.verifySession();

    expect(res.errorCode).toBe('IP_REAUTH_REQUIRED');
    expect(await SecureAuthStore.getDesktopAccessToken()).toBeNull();
    expect(await SecureAuthStore.getLeaseToken()).toBeNull();

    // Stable deviceKey must be retained!
    const deviceKey = await SecureAuthStore.getOrCreateDeviceKey();
    expect(deviceKey).toMatch(/^cword-/);
  });
});
