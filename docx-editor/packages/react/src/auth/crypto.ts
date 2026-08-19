// Copyright (c) 2026 Casual Office
// SPDX-License-Identifier: Apache-2.0

import type { LeasePayload } from './types.ts';
import { CWORD_AUTH_CONFIG } from './config.ts';

// Base64 and Base64URL encoding/decoding helpers
export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(b64url: string): Uint8Array {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) {
    b64 += '=';
  }
  return base64ToBytes(b64);
}

export function stringToBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return bytesToBase64Url(bytes);
}

export function base64UrlToString(b64url: string): string {
  const bytes = base64UrlToBytes(b64url);
  return new TextDecoder().decode(bytes);
}

/**
 * Generates URL-safe random string for PKCE verifier (43-128 chars), state (16-256 chars), and nonce.
 */
export function generateRandomUrlSafeString(length: number): string {
  const randomBytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(randomBytes);
  } else {
    for (let i = 0; i < length; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return bytesToBase64Url(randomBytes).slice(0, length);
}

/**
 * Creates PKCE S256 code challenge: base64url(SHA-256(codeVerifier))
 */
export async function createPkceChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToBase64Url(new Uint8Array(digest));
}

/**
 * Generates Ed25519 key pair for installation device proof binding.
 */
export async function generateDeviceKeyPair(): Promise<{
  publicKeySpkiBase64: string;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}> {
  const keyPair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;

  const spkiBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const publicKeySpkiBase64 = bytesToBase64(new Uint8Array(spkiBuffer));

  return {
    publicKeySpkiBase64,
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
  };
}

/**
 * Exports private key to JWK for secure persistent storage.
 */
export async function exportPrivateKeyJwk(privateKey: CryptoKey): Promise<JsonWebKey> {
  return await crypto.subtle.exportKey('jwk', privateKey);
}

/**
 * Imports private key from JWK format.
 */
export async function importPrivateKeyJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return await crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, true, ['sign']);
}

/**
 * Signs device proof for GET /api/desktop/session?appSlug=cword
 * Message string UTF-8:
 * GET
 * /api/desktop/session?appSlug=cword
 * {timestamp}
 * {nonce}
 */
export async function createDeviceProofSignature(
  privateKey: CryptoKey,
  timestampSeconds: number,
  nonce: string,
  appSlug = CWORD_AUTH_CONFIG.appSlug
): Promise<string> {
  const message = `GET\n/api/desktop/session?appSlug=${appSlug}\n${timestampSeconds}\n${nonce}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const sigBuf = await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, data);
  return bytesToBase64Url(new Uint8Array(sigBuf));
}

/**
 * Verifies Ed25519 lease token offline.
 * Enforces 2-part format: base64url(JSON payload).base64url(Ed25519 signature)
 */
export async function verifyLeaseTokenOffline(
  leaseToken: string,
  leasePublicKeyBase64: string
): Promise<{ valid: boolean; payload?: LeasePayload; error?: string }> {
  if (!leaseToken || !leasePublicKeyBase64) {
    return { valid: false, error: 'Missing lease token or public key' };
  }

  const parts = leaseToken.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Lease token must consist of exactly 2 parts separated by .' };
  }

  const [payloadB64Url, sigB64Url] = parts;

  try {
    const spkiBytes = base64ToBytes(leasePublicKeyBase64);
    const pubKey = await crypto.subtle.importKey(
      'spki',
      spkiBytes.buffer as ArrayBuffer,
      { name: 'Ed25519' },
      true,
      ['verify']
    );

    const sigBytes = base64UrlToBytes(sigB64Url);
    const messageBytes = new TextEncoder().encode(payloadB64Url);

    const isValid = await crypto.subtle.verify(
      { name: 'Ed25519' },
      pubKey,
      sigBytes.buffer as ArrayBuffer,
      messageBytes
    );

    if (!isValid) {
      return { valid: false, error: 'Ed25519 lease signature verification failed' };
    }

    const payloadJson = base64UrlToString(payloadB64Url);
    const payload = JSON.parse(payloadJson) as LeasePayload;

    if (payload.version !== 1) {
      return { valid: false, error: `Unsupported lease version: ${payload.version}` };
    }

    return { valid: true, payload };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, error: `Lease verification error: ${message}` };
  }
}
