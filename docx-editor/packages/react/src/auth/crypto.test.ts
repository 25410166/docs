// Copyright (c) 2026 Casual Office
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'bun:test';
import {
  base64ToBytes,
  base64UrlToBytes,
  bytesToBase64,
  bytesToBase64Url,
  createDeviceProofSignature,
  createPkceChallenge,
  exportPrivateKeyJwk,
  generateDeviceKeyPair,
  generateRandomUrlSafeString,
  importPrivateKeyJwk,
  verifyLeaseTokenOffline,
} from './crypto.ts';

describe('CWord Auth Crypto Utilities', () => {
  it('encodes and decodes base64 and base64url', () => {
    const input = new TextEncoder().encode('CookApps CWord Auth 2026');
    const b64 = bytesToBase64(input);
    const b64Url = bytesToBase64Url(input);

    expect(b64).toBeDefined();
    expect(b64Url).not.toContain('+');
    expect(b64Url).not.toContain('/');
    expect(b64Url).not.toContain('=');

    const decodedB64 = base64ToBytes(b64);
    const decodedB64Url = base64UrlToBytes(b64Url);

    expect(new TextDecoder().decode(decodedB64)).toBe('CookApps CWord Auth 2026');
    expect(new TextDecoder().decode(decodedB64Url)).toBe('CookApps CWord Auth 2026');
  });

  it('generates random url-safe string of requested length', () => {
    const s16 = generateRandomUrlSafeString(16);
    const s64 = generateRandomUrlSafeString(64);

    expect(s16.length).toBe(16);
    expect(s64.length).toBe(64);
    expect(s16).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('generates PKCE S256 code challenge correctly', async () => {
    const verifier = 'E9Melhoa2OwvFrGMTJguCHaoG01mgf473_8A51f9b88';
    const challenge = await createPkceChallenge(verifier);

    expect(challenge).toBeDefined();
    expect(challenge.length).toBeGreaterThan(20);
    expect(challenge).not.toContain('+');
    expect(challenge).not.toContain('/');
  });

  it('generates Ed25519 device keypair and exports SPKI DER Base64', async () => {
    const keyPair = await generateDeviceKeyPair();

    expect(keyPair.publicKeySpkiBase64).toBeDefined();
    expect(keyPair.publicKeySpkiBase64.length).toBeGreaterThan(30);

    const jwk = await exportPrivateKeyJwk(keyPair.privateKey);
    expect(jwk.kty).toBe('OKP');
    expect(jwk.crv).toBe('Ed25519');

    const importedPrivateKey = await importPrivateKeyJwk(jwk);
    expect(importedPrivateKey).toBeDefined();
  });

  it('creates device proof signature matching format', async () => {
    const keyPair = await generateDeviceKeyPair();
    const timestamp = 1755526200;
    const nonce = 'random-nonce-12345';

    const sig = await createDeviceProofSignature(keyPair.privateKey, timestamp, nonce, 'cword');

    expect(sig).toBeDefined();
    expect(sig.length).toBeGreaterThan(30);
    expect(sig).not.toContain('+');
    expect(sig).not.toContain('/');
  });

  it('rejects lease tokens that do not have exactly 2 parts', async () => {
    const keyPair = await generateDeviceKeyPair();
    const res3Parts = await verifyLeaseTokenOffline(
      'part1.part2.part3',
      keyPair.publicKeySpkiBase64
    );
    expect(res3Parts.valid).toBe(false);
    expect(res3Parts.error).toContain('exactly 2 parts');

    const res1Part = await verifyLeaseTokenOffline('part1only', keyPair.publicKeySpkiBase64);
    expect(res1Part.valid).toBe(false);
  });

  it('verifies 2-part Ed25519 lease token successfully', async () => {
    const keyPair = await generateDeviceKeyPair();

    const payloadObj = {
      version: 1,
      user_id: 'usr_cword_123',
      device_id: 'dev_cword_456',
      app_entitlements: ['cword'],
      entitlement_allowed: true,
      issued_at: Math.floor(Date.now() / 1000) - 100,
      expires_at: Math.floor(Date.now() / 1000) + 86400,
      grace_until: Math.floor(Date.now() / 1000) + 172800,
    };

    const payloadJson = JSON.stringify(payloadObj);
    const payloadB64Url = bytesToBase64Url(new TextEncoder().encode(payloadJson));

    const sigBuf = await crypto.subtle.sign(
      { name: 'Ed25519' },
      keyPair.privateKey,
      new TextEncoder().encode(payloadB64Url)
    );
    const sigB64Url = bytesToBase64Url(new Uint8Array(sigBuf));

    const leaseToken = `${payloadB64Url}.${sigB64Url}`;

    const check = await verifyLeaseTokenOffline(leaseToken, keyPair.publicKeySpkiBase64);

    expect(check.valid).toBe(true);
    expect(check.payload?.user_id).toBe('usr_cword_123');
    expect(check.payload?.app_entitlements).toContain('cword');
  });
});
