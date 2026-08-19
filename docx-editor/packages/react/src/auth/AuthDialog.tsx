// Copyright (c) 2026 Casual Office
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from 'react';
import { AuthService } from './service.ts';
import type { DeviceInfo, EntitlementInfo, UserPlanInfo } from './types.ts';

type AuthWindow = Window & {
  __deskApp__?: {
    openExternalUrl?: (url: string) => Promise<void>;
  };
  __TAURI__?: {
    opener?: {
      openUrl: (url: string) => Promise<void>;
    };
  };
};

export interface AuthDialogProps {
  isOpen: boolean;
  onClose?: () => void;
  canClose?: boolean;
  autoStart?: boolean;
  onAuthenticated?: (user: UserPlanInfo, entitlement: EntitlementInfo) => void;
  authService: AuthService;
}

export type LoginState =
  | 'idle'
  | 'starting'
  | 'opening_browser'
  | 'waiting_confirmation'
  | 'verifying_device'
  | 'signed_in'
  | 'rate_limited'
  | 'upgrade_required'
  | 'device_limit_reached'
  | 'ip_reauth_required'
  | 'device_revoked'
  | 'error';

export function AuthDialog({
  isOpen,
  onClose,
  canClose = true,
  autoStart = true,
  onAuthenticated,
  authService,
}: AuthDialogProps) {
  const [state, setState] = useState<LoginState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [user, setUser] = useState<UserPlanInfo | null>(null);
  const [entitlement, setEntitlement] = useState<EntitlementInfo | null>(null);
  const [activeDevices, setActiveDevices] = useState<DeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [loginUrl, setLoginUrl] = useState<string | null>(null);

  const openExternalUrl = useCallback(async (targetUrl: string) => {
    const desktopBridge =
      typeof window !== 'undefined' ? (window as AuthWindow).__deskApp__ : undefined;
    if (desktopBridge?.openExternalUrl) {
      await desktopBridge.openExternalUrl(targetUrl);
      return;
    }

    const opener =
      typeof window !== 'undefined' ? (window as AuthWindow).__TAURI__?.opener : undefined;
    if (opener?.openUrl) {
      await opener.openUrl(targetUrl);
      return;
    }

    const openedWindow = window.open(targetUrl, '_blank', 'noopener,noreferrer');
    if (!openedWindow) throw new Error('Could not open system browser');
  }, []);

  const handleStartLogin = useCallback(
    async (replaceDeviceId?: string) => {
      setState('starting');
      setErrorMessage(null);
      const startRes = await authService.startLogin({ replaceDeviceId });

      if (!startRes.success || !startRes.loginUrl) {
        if (startRes.errorCode === 'RATE_LIMITED') {
          setState('rate_limited');
        } else {
          setState('error');
          setErrorMessage(startRes.error || 'Failed to start authentication session');
        }
        return;
      }

      setLoginUrl(startRes.loginUrl);
      setState('opening_browser');
      try {
        await openExternalUrl(startRes.loginUrl);
        setState('waiting_confirmation');
      } catch (error) {
        setState('error');
        setErrorMessage(error instanceof Error ? error.message : 'Could not open system browser');
      }
    },
    [authService, openExternalUrl]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleUrl = async (urlStr: string) => {
      if (urlStr.includes('cookapps-cword://auth')) {
        setState('verifying_device');
        setErrorMessage(null);
        const res = await authService.handleCallbackUrl(urlStr);
        if (res.success && res.data?.authenticated && res.data.user && res.data.entitlement) {
          setUser(res.data.user);
          setEntitlement(res.data.entitlement);
          setState('signed_in');
          if (onAuthenticated) onAuthenticated(res.data.user, res.data.entitlement);
        } else {
          if (res.data?.errorCode === 'UPGRADE_REQUIRED') {
            setState('upgrade_required');
            setEntitlement(res.data.entitlement || null);
          } else if (res.data?.errorCode === 'DEVICE_LIMIT_REACHED') {
            setState('device_limit_reached');
            setActiveDevices(res.data.activeDevices || []);
          } else if (res.data?.errorCode === 'IP_REAUTH_REQUIRED') {
            setState('ip_reauth_required');
          } else if (res.data?.errorCode === 'DEVICE_REVOKED') {
            setState('device_revoked');
          } else if (res.data?.errorCode === 'RATE_LIMITED') {
            setState('rate_limited');
          } else {
            setState('error');
            setErrorMessage(res.error || res.data?.error || 'Authentication failed');
          }
        }
      }
    };

    const tauriListener = (event: CustomEvent<{ url: string }>) => {
      if (event.detail?.url) {
        handleUrl(event.detail.url);
      }
    };

    window.addEventListener(
      'cword:deeplink' as keyof WindowEventMap,
      tauriListener as EventListener
    );

    // Initial check for deep link in window location or desktop window
    if (window.location.href.includes('cookapps-cword://auth')) {
      handleUrl(window.location.href);
    }

    return () => {
      window.removeEventListener(
        'cword:deeplink' as keyof WindowEventMap,
        tauriListener as EventListener
      );
    };
  }, [authService, onAuthenticated]);

  useEffect(() => {
    if (!isOpen || !autoStart || state !== 'idle') return;
    void handleStartLogin();
  }, [autoStart, handleStartLogin, isOpen, state]);

  if (!isOpen) return null;

  const handleReplaceDeviceConfirm = () => {
    if (!selectedDeviceId) return;
    handleStartLogin(selectedDeviceId);
  };

  return (
    <div className="cword-auth-modal-overlay" style={overlayStyle}>
      <div className="cword-auth-modal-card" style={cardStyle}>
        <div style={headerStyle}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
            CookApps Authentication — CWord
          </h2>
          {onClose && canClose && (
            <button onClick={onClose} style={closeButtonStyle}>
              ×
            </button>
          )}
        </div>

        <div style={bodyStyle}>
          {state === 'idle' && (
            <div>
              <p style={{ marginBottom: '1.25rem', color: '#4b5563' }}>
                {autoStart
                  ? 'Sign in with your CookApps account to activate CWord and sync entitlements.'
                  : 'Checking CookApps session...'}
              </p>
              {autoStart && (
                <button onClick={() => handleStartLogin()} style={primaryButtonStyle}>
                  Login by CookApps Account
                </button>
              )}
            </div>
          )}

          {state === 'starting' && (
            <div style={{ textAlign: 'center', padding: '1rem' }}>
              <div className="spinner" style={spinnerStyle} />
              <p>Opening CookApps...</p>
            </div>
          )}

          {state === 'opening_browser' && (
            <div style={{ textAlign: 'center', padding: '1rem' }}>
              <p>Opening system browser...</p>
            </div>
          )}

          {state === 'waiting_confirmation' && (
            <div style={{ textAlign: 'center', padding: '1rem' }}>
              <div className="spinner" style={spinnerStyle} />
              <p style={{ fontWeight: 500 }}>Waiting for confirmation...</p>
              <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                Complete login in your browser window. This window will update automatically.
              </p>
              {loginUrl && (
                <button onClick={() => void openExternalUrl(loginUrl)} style={secondaryButtonStyle}>
                  Re-open Login Page
                </button>
              )}
            </div>
          )}

          {state === 'verifying_device' && (
            <div style={{ textAlign: 'center', padding: '1rem' }}>
              <div className="spinner" style={spinnerStyle} />
              <p style={{ fontWeight: 500 }}>Verifying device...</p>
            </div>
          )}

          {state === 'signed_in' && (
            <div style={{ textAlign: 'center', padding: '1rem' }}>
              <h3 style={{ color: '#16a34a', margin: '0 0 0.5rem 0' }}>Signed in</h3>
              {user && (
                <p style={{ margin: '0.25rem 0' }}>
                  User: {user.name} ({user.email})
                </p>
              )}
              {entitlement && (
                <p style={{ margin: '0.25rem 0', fontSize: '0.875rem', color: '#4b5563' }}>
                  Plan: {user?.planCode || 'Active'}
                </p>
              )}
              <button onClick={onClose} style={{ ...primaryButtonStyle, marginTop: '1rem' }}>
                Continue to CWord
              </button>
            </div>
          )}

          {state === 'rate_limited' && (
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#dc2626' }}>
                Rate limited. Please wait a moment before retrying.
              </p>
              <button onClick={() => handleStartLogin()} style={primaryButtonStyle}>
                Retry Login
              </button>
            </div>
          )}

          {state === 'upgrade_required' && (
            <div>
              <p style={{ color: '#dc2626', fontWeight: 600 }}>Upgrade Required</p>
              <p style={{ color: '#4b5563' }}>
                {entitlement?.reason || 'CWord requires a Personal or Family subscription.'}
              </p>
              {entitlement?.checkoutUrl && (
                <a
                  href={entitlement.checkoutUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ ...primaryButtonStyle, display: 'inline-block', textDecoration: 'none' }}
                >
                  Upgrade Subscription
                </a>
              )}
            </div>
          )}

          {state === 'device_limit_reached' && (
            <div>
              <p style={{ color: '#dc2626', fontWeight: 600 }}>Device Limit Reached</p>
              <p style={{ fontSize: '0.875rem', color: '#4b5563' }}>
                Your plan limit has been reached. Select an active device to replace:
              </p>
              <div style={{ margin: '1rem 0', maxHeight: '150px', overflowY: 'auto' }}>
                {activeDevices.map((dev) => (
                  <label
                    key={dev.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      marginBottom: '0.5rem',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="deviceReplace"
                      value={dev.id}
                      checked={selectedDeviceId === dev.id}
                      onChange={(e) => setSelectedDeviceId(e.target.value)}
                    />
                    <div>
                      <strong>{dev.name}</strong> ({dev.platform})
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        Last active: {dev.lastActiveAt || 'Unknown'}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              <button
                onClick={handleReplaceDeviceConfirm}
                disabled={!selectedDeviceId}
                style={{ ...primaryButtonStyle, opacity: selectedDeviceId ? 1 : 0.5 }}
              >
                Replace Device and Sign In
              </button>
            </div>
          )}

          {state === 'ip_reauth_required' && (
            <div>
              <p style={{ color: '#d97706', fontWeight: 600 }}>IP Change Detected</p>
              <p style={{ color: '#4b5563' }}>
                Your public IP address changed. Please re-authenticate online to verify your device
                session.
              </p>
              <button onClick={() => handleStartLogin()} style={primaryButtonStyle}>
                Re-authenticate Now
              </button>
            </div>
          )}

          {state === 'device_revoked' && (
            <div>
              <p style={{ color: '#dc2626', fontWeight: 600 }}>Device Revoked</p>
              <p style={{ color: '#4b5563' }}>
                This device has been revoked from your CookApps account.
              </p>
              <button onClick={() => handleStartLogin()} style={primaryButtonStyle}>
                Sign In Again
              </button>
            </div>
          )}

          {state === 'error' && (
            <div>
              <p style={{ color: '#dc2626' }}>{errorMessage || 'Authentication error occurred.'}</p>
              <button onClick={() => handleStartLogin()} style={primaryButtonStyle}>
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
};

const cardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  width: '100%',
  maxWidth: '440px',
  padding: '1.5rem',
  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1px solid #e5e7eb',
  paddingBottom: '0.75rem',
  marginBottom: '1rem',
};

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: '1.5rem',
  cursor: 'pointer',
  color: '#9ca3af',
};

const bodyStyle: React.CSSProperties = {
  paddingTop: '0.5rem',
};

const primaryButtonStyle: React.CSSProperties = {
  backgroundColor: '#2563eb',
  color: '#ffffff',
  border: 'none',
  borderRadius: '6px',
  padding: '0.625rem 1.25rem',
  fontSize: '0.875rem',
  fontWeight: 500,
  cursor: 'pointer',
  width: '100%',
  textAlign: 'center',
};

const secondaryButtonStyle: React.CSSProperties = {
  backgroundColor: '#f3f4f6',
  color: '#374151',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  padding: '0.5rem 1rem',
  fontSize: '0.875rem',
  cursor: 'pointer',
  marginTop: '0.75rem',
};

const spinnerStyle: React.CSSProperties = {
  width: '24px',
  height: '24px',
  border: '3px solid #e5e7eb',
  borderTopColor: '#2563eb',
  borderRadius: '50%',
  margin: '0 auto 0.75rem auto',
  animation: 'spin 1s linear infinite',
};
