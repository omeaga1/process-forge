import React, { useState, useEffect, useRef } from 'react';
import {
  User,
  LogOut,
  Cloud,
  X,
  Building2,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  KeyRound,
  CheckCircle2
} from 'lucide-react';
import { useTheme } from '@process-forge/canvas-ui';
import { useAccount } from '../auth/useAccount.js';
import { getInitials } from '../auth/accountManager.js';
import { isDesktopRuntime } from '../runtime/desktop.js';
import { isDesktopGoogleSignInConfigured } from '../auth/desktopGoogleSignIn.js';

export interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCloudProjects?: () => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  onOpenCloudProjects
}) => {
  const { palette } = useTheme();
  const OsakaJadePalette = palette;
  const { user, isAuthenticated, login, register, signInWithGoogleCredential, signInWithGoogleDesktop, signOut } =
    useAccount();

  // Auth Mode: 'signin' | 'register'
  const [authMode, setAuthMode] = useState<'signin' | 'register'>('signin');
  // Provider Tab: 'email' | 'google'
  const [activeTab, setActiveTab] = useState<'email' | 'google'>('email');

  // Form inputs
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [orgInput, setOrgInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // The site's own OAuth client. It used to be overridable from localStorage,
  // but the cloud API only accepts tokens issued for its configured clients,
  // so an override could never have produced a working sign-in.
  const googleClientId: string = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '';
  const googleButtonContainerRef = useRef<HTMLDivElement>(null);

  // Status state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Initialize Google Identity Services (GIS) when Google tab is active and client ID is present
  useEffect(() => {
    if (!isOpen || activeTab !== 'google' || !googleClientId || isDesktopRuntime()) return;

    const gis = (window as any).google?.accounts?.id;
    if (!gis) return;

    try {
      gis.initialize({
        client_id: googleClientId,
        callback: async (response: any) => {
          if (response.credential) {
            setIsSubmitting(true);
            try {
              const session = await signInWithGoogleCredential(response.credential);
              if (session) {
                setSuccessMessage(`Welcome, ${session.name}! Signed in with Google.`);
                setTimeout(() => {
                  setIsSubmitting(false);
                  onClose();
                }, 800);
              }
            } catch (err: any) {
              setErrorMessage(err.message || 'Failed to authenticate Google credential.');
              setIsSubmitting(false);
            }
          }
        },
        auto_select: false,
        cancel_on_tap_outside: true
      });

      if (googleButtonContainerRef.current) {
        googleButtonContainerRef.current.innerHTML = '';
        gis.renderButton(googleButtonContainerRef.current, {
          theme: 'outline',
          size: 'large',
          type: 'standard',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: 320
        });
      }

      // Automatically prompt One Tap dialog
      gis.prompt();
    } catch (e: any) {
      console.warn('GIS initialization error:', e);
    }
  }, [isOpen, activeTab, googleClientId]);

  if (!isOpen) return null;

  const handleDesktopGoogleSignIn = async () => {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const session = await signInWithGoogleDesktop();
      setSuccessMessage(`Signed in as ${session.email}.`);
      setTimeout(() => {
        setIsSubmitting(false);
        onClose();
      }, 800);
    } catch (e: any) {
      setErrorMessage(e?.message || 'Google sign-in failed.');
      setIsSubmitting(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    if (authMode === 'register') {
      if (passwordInput !== confirmPasswordInput) {
        setErrorMessage('Passwords do not match.');
        setIsSubmitting(false);
        return;
      }
      try {
        await register({
          email: emailInput.trim(),
          password: passwordInput,
          name: nameInput.trim() || undefined,
          organization: orgInput.trim() || undefined
        });
        setSuccessMessage('Account created successfully! Welcome to ProcessForge.');
        setTimeout(() => {
          setIsSubmitting(false);
          onClose();
        }, 800);
      } catch (err: any) {
        setErrorMessage(err.message || 'Registration failed.');
        setIsSubmitting(false);
      }
    } else {
      try {
        await login({ email: emailInput.trim(), password: passwordInput });
        setSuccessMessage('Signed in successfully!');
        setTimeout(() => {
          setIsSubmitting(false);
          onClose();
        }, 800);
      } catch (err: any) {
        setErrorMessage(err.message || 'Invalid email or password.');
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 10, 12, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          backgroundColor: OsakaJadePalette.background.surface,
          border: `1px solid ${OsakaJadePalette.border.default}`,
          borderRadius: 12,
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeIn 0.15s ease-out'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: OsakaJadePalette.background.canvas,
            borderBottom: `1px solid ${OsakaJadePalette.border.default}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: OsakaJadePalette.jade.muted,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `1px solid ${OsakaJadePalette.jade[600]}`
              }}
            >
              <User size={18} color={OsakaJadePalette.jade[400]} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: OsakaJadePalette.text.primary }}>
                {isAuthenticated ? 'Engineer Profile & Cloud Sync' : 'ProcessForge Account'}
              </div>
              <div style={{ fontSize: 11, color: OsakaJadePalette.text.muted }}>
                {isAuthenticated ? 'Manage session & cloud storage quota' : 'Password-secured authentication for cloud digital twins'}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: OsakaJadePalette.text.muted,
              cursor: 'pointer',
              padding: 4
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 20 }}>
          {isAuthenticated && user ? (
            /* ── AUTHENTICATED PROFILE VIEW ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* User Identity Card */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: 16,
                  backgroundColor: OsakaJadePalette.background.canvas,
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  borderRadius: 10
                }}
              >
                {/* Authentic Avatar / Monogram */}
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    overflow: 'hidden',
                    backgroundColor: OsakaJadePalette.jade[600],
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 20,
                    flexShrink: 0,
                    border: `2px solid ${OsakaJadePalette.jade[400]}`
                  }}
                >
                  {user.avatarUrl && !user.avatarUrl.includes('images.unsplash.com') ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => {
                        // Fallback to text initials if image fails
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <span>{getInitials(user.name, user.email)}</span>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: OsakaJadePalette.text.primary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {user.name}
                    </div>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 10,
                        backgroundColor: 'rgba(16, 185, 129, 0.15)',
                        border: `1px solid ${OsakaJadePalette.jade[600]}`,
                        color: OsakaJadePalette.text.accent,
                        fontSize: 10,
                        fontWeight: 700
                      }}
                    >
                      {user.plan}
                    </span>
                  </div>

                  <div style={{ fontSize: 12, color: OsakaJadePalette.text.muted, marginTop: 2 }}>
                    {user.email}
                  </div>

                  <div style={{ fontSize: 11, color: OsakaJadePalette.text.secondary, marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Building2 size={12} />
                    <span>{user.organization || 'Process Engineering'}</span>
                    <span>•</span>
                    <span style={{ textTransform: 'capitalize' }}>{user.provider} Account</span>
                  </div>
                </div>
              </div>

              {/* Cloud Storage Quota Bar */}
              <div
                style={{
                  padding: 14,
                  backgroundColor: OsakaJadePalette.background.canvas,
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  borderRadius: 10
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: OsakaJadePalette.text.primary }}>
                    <Cloud size={14} color={OsakaJadePalette.jade[400]} />
                    <span>Cloud Storage Capacity</span>
                  </div>
                  <div style={{ fontSize: 11, color: OsakaJadePalette.text.muted }}>
                    {user.cloudStorageQuota?.usedProjects || 0} / {user.cloudStorageQuota?.maxProjects || 50} Simulations
                  </div>
                </div>

                <div
                  style={{
                    width: '100%',
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, (((user.cloudStorageQuota?.usedProjects || 0)) / (user.cloudStorageQuota?.maxProjects || 50)) * 100)}%`,
                      height: '100%',
                      backgroundColor: OsakaJadePalette.jade[500],
                      borderRadius: 3
                    }}
                  />
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10 }}>
                {onOpenCloudProjects && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenCloudProjects();
                    }}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      padding: '10px 14px',
                      borderRadius: 8,
                      backgroundColor: OsakaJadePalette.jade[600],
                      border: 'none',
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <Cloud size={15} />
                    <span>Browse Cloud Projects</span>
                  </button>
                )}

                <button
                  onClick={signOut}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    padding: '10px 16px',
                    borderRadius: 8,
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#f87171',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <LogOut size={15} />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          ) : (
            /* ── UNAUTHENTICATED SIGN IN / REGISTER VIEW ── */
            <div>
              {/* Provider Tabs: Email/Password vs Google */}
              <div
                style={{
                  display: 'flex',
                  backgroundColor: OsakaJadePalette.background.canvas,
                  borderRadius: 8,
                  padding: 3,
                  marginBottom: 16
                }}
              >
                <button
                  onClick={() => {
                    setActiveTab('email');
                    setErrorMessage(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: 'none',
                    backgroundColor: activeTab === 'email' ? OsakaJadePalette.background.surface : 'transparent',
                    color: activeTab === 'email' ? OsakaJadePalette.text.primary : OsakaJadePalette.text.secondary,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  <Mail size={14} />
                  <span>Email & Password</span>
                </button>

                <button
                  onClick={() => {
                    setActiveTab('google');
                    setErrorMessage(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: 'none',
                    backgroundColor: activeTab === 'google' ? OsakaJadePalette.background.surface : 'transparent',
                    color: activeTab === 'google' ? OsakaJadePalette.text.primary : OsakaJadePalette.text.secondary,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  <KeyRound size={14} />
                  <span>Google Account</span>
                </button>
              </div>

              {/* Feedback Alerts */}
              {errorMessage && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 12px',
                    borderRadius: 6,
                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#f87171',
                    fontSize: 12,
                    marginBottom: 14
                  }}
                >
                  <AlertCircle size={15} style={{ flexShrink: 0 }} />
                  <span>{errorMessage}</span>
                </div>
              )}

              {successMessage && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 12px',
                    borderRadius: 6,
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    border: `1px solid ${OsakaJadePalette.jade[600]}`,
                    color: OsakaJadePalette.text.accent,
                    fontSize: 12,
                    marginBottom: 14
                  }}
                >
                  <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
                  <span>{successMessage}</span>
                </div>
              )}

              {activeTab === 'email' ? (
                /* ── EMAIL & PASSWORD FORM ── */
                <div>
                  {/* Mode Selector: Sign In vs Create Account */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: OsakaJadePalette.text.primary }}>
                      {authMode === 'signin' ? 'Sign In to Your Account' : 'Create New Engineer Account'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode(authMode === 'signin' ? 'register' : 'signin');
                        setErrorMessage(null);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: OsakaJadePalette.jade.glow,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {authMode === 'signin' ? 'Need an account? Register →' : 'Already registered? Sign In →'}
                    </button>
                  </div>

                  <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Email Input */}
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: OsakaJadePalette.text.secondary, marginBottom: 4 }}>
                        Work Email
                      </label>
                      <div style={{ position: 'relative' }}>
                        <Mail size={15} color={OsakaJadePalette.text.muted} style={{ position: 'absolute', left: 10, top: 11 }} />
                        <input
                          type="email"
                          required
                          value={emailInput}
                          onChange={(e) => setEmailInput(e.target.value)}
                          placeholder="engineer@company.com"
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            backgroundColor: OsakaJadePalette.background.canvas,
                            border: `1px solid ${OsakaJadePalette.border.default}`,
                            borderRadius: 6,
                            padding: '8px 10px 8px 34px',
                            color: OsakaJadePalette.text.primary,
                            fontSize: 13,
                            outline: 'none'
                          }}
                        />
                      </div>
                    </div>

                    {/* Registration specific fields: Name & Organization */}
                    {authMode === 'register' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: OsakaJadePalette.text.secondary, marginBottom: 4 }}>
                            Full Name
                          </label>
                          <input
                            type="text"
                            value={nameInput}
                            onChange={(e) => setNameInput(e.target.value)}
                            placeholder="Alex Vance"
                            style={{
                              width: '100%',
                              boxSizing: 'border-box',
                              backgroundColor: OsakaJadePalette.background.canvas,
                              border: `1px solid ${OsakaJadePalette.border.default}`,
                              borderRadius: 6,
                              padding: '8px 10px',
                              color: OsakaJadePalette.text.primary,
                              fontSize: 13,
                              outline: 'none'
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: OsakaJadePalette.text.secondary, marginBottom: 4 }}>
                            Organization
                          </label>
                          <input
                            type="text"
                            value={orgInput}
                            onChange={(e) => setOrgInput(e.target.value)}
                            placeholder="Process Engineering"
                            style={{
                              width: '100%',
                              boxSizing: 'border-box',
                              backgroundColor: OsakaJadePalette.background.canvas,
                              border: `1px solid ${OsakaJadePalette.border.default}`,
                              borderRadius: 6,
                              padding: '8px 10px',
                              color: OsakaJadePalette.text.primary,
                              fontSize: 13,
                              outline: 'none'
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Password Input */}
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: OsakaJadePalette.text.secondary, marginBottom: 4 }}>
                        Password {authMode === 'register' && '(minimum 8 characters)'}
                      </label>
                      <div style={{ position: 'relative' }}>
                        <Lock size={15} color={OsakaJadePalette.text.muted} style={{ position: 'absolute', left: 10, top: 11 }} />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={passwordInput}
                          onChange={(e) => setPasswordInput(e.target.value)}
                          placeholder="••••••••"
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            backgroundColor: OsakaJadePalette.background.canvas,
                            border: `1px solid ${OsakaJadePalette.border.default}`,
                            borderRadius: 6,
                            padding: '8px 36px 8px 34px',
                            color: OsakaJadePalette.text.primary,
                            fontSize: 13,
                            outline: 'none'
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          style={{
                            position: 'absolute',
                            right: 8,
                            top: 8,
                            background: 'none',
                            border: 'none',
                            color: OsakaJadePalette.text.muted,
                            cursor: 'pointer',
                            padding: 2
                          }}
                        >
                          {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>

                    {/* Confirm Password (Register mode only) */}
                    {authMode === 'register' && (
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: OsakaJadePalette.text.secondary, marginBottom: 4 }}>
                          Confirm Password
                        </label>
                        <div style={{ position: 'relative' }}>
                          <Lock size={15} color={OsakaJadePalette.text.muted} style={{ position: 'absolute', left: 10, top: 11 }} />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            value={confirmPasswordInput}
                            onChange={(e) => setConfirmPasswordInput(e.target.value)}
                            placeholder="••••••••"
                            style={{
                              width: '100%',
                              boxSizing: 'border-box',
                              backgroundColor: OsakaJadePalette.background.canvas,
                              border: `1px solid ${OsakaJadePalette.border.default}`,
                              borderRadius: 6,
                              padding: '8px 10px 8px 34px',
                              color: OsakaJadePalette.text.primary,
                              fontSize: 13,
                              outline: 'none'
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      style={{
                        marginTop: 6,
                        padding: '10px 16px',
                        borderRadius: 6,
                        backgroundColor: OsakaJadePalette.jade[600],
                        border: 'none',
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: isSubmitting ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                      }}
                    >
                      <span>{authMode === 'signin' ? 'Sign In to Account' : 'Create Account & Enable Cloud Sync'}</span>
                      <ArrowRight size={14} />
                    </button>
                  </form>
                </div>
              ) : (
                /* ── GOOGLE SIGN-IN TAB ── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <p style={{ fontSize: 12, color: OsakaJadePalette.text.secondary, margin: 0, lineHeight: 1.5 }}>
                    A Google account is what ProcessForge Cloud uses to know whose projects are whose. Your
                    projects stay on this device until you choose Save to Cloud.
                  </p>
                  {isDesktopRuntime() ? (
                    isDesktopGoogleSignInConfigured() ? (
                      <button
                        type="button"
                        onClick={handleDesktopGoogleSignIn}
                        disabled={isSubmitting}
                        style={{
                          padding: '10px 16px',
                          borderRadius: 6,
                          backgroundColor: OsakaJadePalette.jade[600],
                          border: 'none',
                          color: '#fff',
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: isSubmitting ? 'wait' : 'pointer'
                        }}
                      >
                        {isSubmitting ? 'Waiting for your browser…' : 'Continue with Google'}
                      </button>
                    ) : (
                      <p role="status" style={{ fontSize: 12, color: OsakaJadePalette.text.muted, margin: 0 }}>
                        Google sign-in is not set up in this desktop build yet. Everything else works without an
                        account; projects are saved on this device.
                      </p>
                    )
                  ) : googleClientId ? (
                    <div ref={googleButtonContainerRef} style={{ minHeight: 44 }} />
                  ) : (
                    <p role="status" style={{ fontSize: 12, color: OsakaJadePalette.text.muted, margin: 0 }}>
                      Google sign-in is not configured for this site.
                    </p>
                  )}
                  {isDesktopRuntime() && isSubmitting && (
                    <p style={{ fontSize: 11, color: OsakaJadePalette.text.muted, margin: 0 }}>
                      Finish signing in in the browser window that opened, then come back here.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
