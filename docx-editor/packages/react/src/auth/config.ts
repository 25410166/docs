// Copyright (c) 2026 Casual Office
// SPDX-License-Identifier: Apache-2.0

export interface AuthConfigOptions {
  baseUrl?: string;
  leasePublicKeyBase64?: string;
}

export const CWORD_AUTH_CONFIG = {
  appName: 'CWord',
  appSlug: 'cword',
  callbackScheme: 'cookapps-cword',
  callbackUrlPrefix: 'cookapps-cword://auth',
  productionBaseUrl: 'https://cookapps.net',
  localBaseUrl: 'http://localhost:3000',
  productionLoginPage: 'https://cookapps.net/desktop-login',
  openApiUrl: 'https://cookapps.net/openapi.json',
  localOpenApiUrl: 'apps/web/public/openapi.json',
};

/**
 * Resolves base URL for auth requests.
 * Priorities:
 * 1. Provided explicit option
 * 2. Process env variable VITE_COOKAPPS_BASE_URL
 * 3. Environment default (production if import.meta.env.PROD, else local/production fallback)
 */
export function resolveCookAppsBaseUrl(overrideUrl?: string): string {
  if (overrideUrl) return overrideUrl.replace(/\/$/, '');
  
  if (typeof process !== 'undefined' && process.env?.VITE_COOKAPPS_BASE_URL) {
    return process.env.VITE_COOKAPPS_BASE_URL.replace(/\/$/, '');
  }

  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_COOKAPPS_BASE_URL) {
    return (import.meta.env.VITE_COOKAPPS_BASE_URL as string).replace(/\/$/, '');
  }

  // Default to production base URL
  return CWORD_AUTH_CONFIG.productionBaseUrl;
}
