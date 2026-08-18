// Copyright (c) 2026 Casual Office
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it } from 'bun:test';
import { SecureAuthStore } from './store.ts';

describe('CWord SecureAuthStore', () => {
  beforeEach(async () => {
    await SecureAuthStore.clearPendingFlow();
    await SecureAuthStore.clearSessionTokens();
  });

  it('creates a stable device key matching ^[A-Za-z0-9._:-]{8,160}$', async () => {
    const key1 = await SecureAuthStore.getOrCreateDeviceKey();
    expect(key1).toMatch(/^[A-Za-z0-9._:-]{8,160}$/);
    expect(key1.startsWith('cword-')).toBe(true);

    const key2 = await SecureAuthStore.getOrCreateDeviceKey();
    expect(key2).toBe(key1);
  });

  it('persists and clears pending state and code verifier', async () => {
    await SecureAuthStore.setPendingState('state_xyz_123');
    await SecureAuthStore.setPendingCodeVerifier('verifier_abc_456');

    expect(await SecureAuthStore.getPendingState()).toBe('state_xyz_123');
    expect(await SecureAuthStore.getPendingCodeVerifier()).toBe('verifier_abc_456');

    await SecureAuthStore.clearPendingFlow();

    expect(await SecureAuthStore.getPendingState()).toBeNull();
    expect(await SecureAuthStore.getPendingCodeVerifier()).toBeNull();
  });

  it('persists and clears desktop session tokens', async () => {
    await SecureAuthStore.setDesktopAccessToken('tok_access_cword_999');
    await SecureAuthStore.setLeaseToken('payload.signature');
    await SecureAuthStore.setLeaseExpiresAt(1755500000);
    await SecureAuthStore.setLeaseGraceUntil(1755600000);

    expect(await SecureAuthStore.getDesktopAccessToken()).toBe('tok_access_cword_999');
    expect(await SecureAuthStore.getLeaseToken()).toBe('payload.signature');
    expect(await SecureAuthStore.getLeaseExpiresAt()).toBe(1755500000);
    expect(await SecureAuthStore.getLeaseGraceUntil()).toBe(1755600000);

    await SecureAuthStore.clearSessionTokens();

    expect(await SecureAuthStore.getDesktopAccessToken()).toBeNull();
    expect(await SecureAuthStore.getLeaseToken()).toBeNull();
    expect(await SecureAuthStore.getLeaseExpiresAt()).toBeNull();
    expect(await SecureAuthStore.getLeaseGraceUntil()).toBeNull();
  });
});
