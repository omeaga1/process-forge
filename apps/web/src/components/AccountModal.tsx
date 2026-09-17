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
  CheckCircle2,
  ExternalLink,
  Copy,
  Sparkles
} from 'lucide-react';
import { useTheme } from '@process-forge/canvas-ui';
import { useAccount } from '../auth/useAccount.js';
import { getInitials } from '../auth/accountManager.js';

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
  const { user, isAuthenticated, login, register, signInWithGoogleCredential, signOut } = useAccount();

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

  // Google inputs & client state
  const [googleCredentialInput, setGoogleCredentialInput] = useState('');
  const [googleClientId, setGoogleClientId] = useState<string>(() => {
    return (
      (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID ||
      (typeof localStorage !== 'undefined' ? localStorage.getItem('pf_google_client_id') || '' : '')
    );
  });
  const [customClientIdInput, setCustomClientIdInput] = useState('');
  const [isEditingClientId, setIsEditingClientId] = useState(false);
  const [copiedOrigin, setCopiedOrigin] = useState<string | null>(null);
  const [showAdvancedToken, setShowAdvancedToken] = useState(false);
  const googleButtonContainerRef = useRef<HTMLDivElement>(null);

  // Status state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Initialize Google Identity Services (GIS) when Google tab is active and client ID is present
  useEffect(() => {
    if (!isOpen || activeTab !== 'google' || !googleClientId) return;

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

  const handleSaveClientId = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = customClientIdInput.trim();
    if (!cleaned) return;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pf_google_client_id', cleaned);
    }
    setGoogleClientId(cleaned);
    setIsEditingClientId(false);
    setSuccessMessage('Google Client ID activated! Google Sign-In is ready.');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleCopyOrigin = (origin: string) => {
    navigator.clipboard.writeText(origin);
    setCopiedOrigin(origin);
    setTimeout(() => setCopiedOrigin(null), 2000);
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

  const handleGoogleOneTap = () => {
    setErrorMessage(null);
    const gis = (window as any).google?.accounts?.id;
    if (gis && googleClientId) {
      try {
        gis.prompt();
        return;
      } catch (e: any) {
        console.warn('Google One Tap prompt failed:', e);
      }
    }
    if (!googleClientId) {
      setIsEditingClientId(true);
      setErrorMessage('Please enter your Google Client ID below to enable Google One Tap.');
    }
  };

  const handleGoogleTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleCredentialInput.trim()) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const session = await signInWithGoogleCredential(googleCredentialInput.trim());
      if (session) {
        setSuccessMessage('Authenticated with Google token!');
        setTimeout(() => {
          setIsSubmitting(false);
          onClose();
        }, 800);
      } else {
        setErrorMessage('Invalid Google OAuth token. Could not decode profile.');
        setIsSubmitting(false);
      }
    } catch (e: any) {
      setErrorMessage(e.message || 'Failed to sign in with Google token.');
      setIsSubmitting(false);
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
                  {googleClientId && !isEditingClientId ? (
                    <div>
                      <p style={{ fontSize: 12, color: OsakaJadePalette.text.secondary, margin: '0 0 12px 0', lineHeight: 1.5 }}>
                        Select your Google account below to authenticate, sync cloud flowsheets, and load your Google profile photo.
                      </p>

                      {/* Official Google Identity Services iframe button container */}
                      <div
                        ref={googleButtonContainerRef}
                        style={{
                          display: 'flex',
                          justifyContent: 'center',
                          minHeight: 44,
                          marginBottom: 12
                        }}
                      />

                      {/* Secondary One Tap trigger */}
                      <button
                        type="button"
                        onClick={handleGoogleOneTap}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          padding: '10px 14px',
                          borderRadius: 6,
                          backgroundColor: 'rgba(255, 255, 255, 0.05)',
                          border: `1px solid ${OsakaJadePalette.border.default}`,
                          color: OsakaJadePalette.text.primary,
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: 'pointer'
                        }}
                      >
                        <Sparkles size={14} color={OsakaJadePalette.jade.glow} />
                        <span>Prompt Google One Tap Overlay</span>
                      </button>

                      {/* Origin Mismatch Helper Box */}
                      <div
                        style={{
                          marginTop: 14,
                          padding: '10px 12px',
                          borderRadius: 6,
                          backgroundColor: OsakaJadePalette.background.canvas,
                          border: `1px solid ${OsakaJadePalette.border.subtle}`,
                          fontSize: 11,
                          color: OsakaJadePalette.text.secondary,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, color: OsakaJadePalette.text.primary }}>
                            Seeing Error 400: origin_mismatch?
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setIsEditingClientId(true);
                              setCustomClientIdInput(googleClientId);
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: OsakaJadePalette.jade.glow,
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer',
                              padding: 0
                            }}
                          >
                            Change Client ID →
                          </button>
                        </div>
                        <p style={{ margin: 0, lineHeight: 1.4 }}>
                          Google requires this exact origin registered in Google Cloud Console under <strong>Authorized JavaScript origins</strong>:
                        </p>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: OsakaJadePalette.background.surface,
                            padding: '6px 10px',
                            borderRadius: 4,
                            border: `1px solid ${OsakaJadePalette.border.default}`
                          }}
                        >
                          <code style={{ color: OsakaJadePalette.jade.glow, fontSize: 11 }}>
                            {typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}
                          </code>
                          <button
                            type="button"
                            onClick={() => handleCopyOrigin(typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: copiedOrigin === (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')
                                ? OsakaJadePalette.jade[400]
                                : OsakaJadePalette.text.muted,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 11
                            }}
                          >
                            <Copy size={12} />
                            <span>{copiedOrigin === (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000') ? 'Copied!' : 'Copy Origin'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* ── GOOGLE CLIENT ID CONFIGURATION GUIDE ── */
                    <div
                      style={{
                        backgroundColor: OsakaJadePalette.background.canvas,
                        border: `1px solid ${OsakaJadePalette.border.default}`,
                        borderRadius: 8,
                        padding: 14
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <KeyRound size={15} color={OsakaJadePalette.jade.glow} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: OsakaJadePalette.text.primary }}>
                            Google Sign-In Configuration
                          </span>
                        </div>
                        {googleClientId && (
                          <button
                            type="button"
                            onClick={() => setIsEditingClientId(false)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: OsakaJadePalette.text.muted,
                              fontSize: 11,
                              cursor: 'pointer'
                            }}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                      <p style={{ fontSize: 11, color: OsakaJadePalette.text.secondary, margin: '0 0 10px 0', lineHeight: 1.5 }}>
                        Google requires a free <strong>OAuth Client ID</strong> from Google Cloud Console so your browser can securely authenticate with Google.
                      </p>

                      <div
                        style={{
                          backgroundColor: OsakaJadePalette.background.surface,
                          borderRadius: 6,
                          padding: 10,
                          marginBottom: 12,
                          fontSize: 11,
                          color: OsakaJadePalette.text.secondary,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6
                        }}
                      >
                        <span style={{ fontWeight: 600, color: OsakaJadePalette.text.primary }}>
                          Authorized JavaScript Origins to add in Google Console:
                        </span>
                        {/* Current Browser Origin */}
                        {typeof window !== 'undefined' && window.location.origin && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 4, borderBottom: `1px solid ${OsakaJadePalette.border.subtle}` }}>
                            <div>
                              <span style={{ fontSize: 10, color: OsakaJadePalette.jade.glow, display: 'block', fontWeight: 600 }}>
                                Current Origin (This Tab):
                              </span>
                              <code style={{ fontSize: 11, color: OsakaJadePalette.text.primary }}>{window.location.origin}</code>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopyOrigin(window.location.origin)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: copiedOrigin === window.location.origin ? OsakaJadePalette.jade[400] : OsakaJadePalette.text.muted,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: 10
                              }}
                            >
                              <Copy size={12} />
                              <span>{copiedOrigin === window.location.origin ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <code style={{ fontSize: 11, color: OsakaJadePalette.jade.glow }}>http://localhost:3000</code>
                          <button
                            type="button"
                            onClick={() => handleCopyOrigin('http://localhost:3000')}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: copiedOrigin === 'http://localhost:3000' ? OsakaJadePalette.jade[400] : OsakaJadePalette.text.muted,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 10
                            }}
                          >
                            <Copy size={12} />
                            <span>{copiedOrigin === 'http://localhost:3000' ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <code style={{ fontSize: 11, color: OsakaJadePalette.jade.glow }}>https://process-forge.pages.dev</code>
                          <button
                            type="button"
                            onClick={() => handleCopyOrigin('https://process-forge.pages.dev')}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: copiedOrigin === 'https://process-forge.pages.dev' ? OsakaJadePalette.jade[400] : OsakaJadePalette.text.muted,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 10
                            }}
                          >
                            <Copy size={12} />
                            <span>{copiedOrigin === 'https://process-forge.pages.dev' ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                      </div>

                      <form onSubmit={handleSaveClientId} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: OsakaJadePalette.text.secondary }}>
                          Paste your Google OAuth Client ID:
                        </label>
                        <input
                          type="text"
                          required
                          value={customClientIdInput}
                          onChange={(e) => setCustomClientIdInput(e.target.value)}
                          placeholder="xxxxxxxxxxxx.apps.googleusercontent.com"
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            backgroundColor: OsakaJadePalette.background.surface,
                            border: `1px solid ${OsakaJadePalette.border.default}`,
                            borderRadius: 6,
                            padding: '8px 10px',
                            color: OsakaJadePalette.text.primary,
                            fontSize: 12,
                            outline: 'none'
                          }}
                        />
                        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                          <button
                            type="submit"
                            disabled={!customClientIdInput.trim()}
                            style={{
                              flex: 1,
                              padding: '8px 12px',
                              borderRadius: 6,
                              backgroundColor: customClientIdInput.trim() ? OsakaJadePalette.jade[600] : 'rgba(255,255,255,0.05)',
                              border: 'none',
                              color: '#fff',
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: customClientIdInput.trim() ? 'pointer' : 'default'
                            }}
                          >
                            Save & Activate Google Sign-In
                          </button>
                          {googleClientId && (
                            <button
                              type="button"
                              onClick={() => setIsEditingClientId(false)}
                              style={{
                                padding: '8px 12px',
                                borderRadius: 6,
                                backgroundColor: 'transparent',
                                border: `1px solid ${OsakaJadePalette.border.default}`,
                                color: OsakaJadePalette.text.secondary,
                                fontSize: 12,
                                cursor: 'pointer'
                              }}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </form>

                      <div style={{ marginTop: 10, textAlign: 'center' }}>
                        <a
                          href="https://console.cloud.google.com/apis/credentials"
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: 11,
                            color: OsakaJadePalette.jade.glow,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <span>Open Google Cloud Credentials Console</span>
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    </div>
                  )}

                  {/* ── ADVANCED DEVELOPER TOKEN OPTION ── */}
                  <div style={{ marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={() => setShowAdvancedToken(!showAdvancedToken)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: OsakaJadePalette.text.muted,
                        fontSize: 11,
                        cursor: 'pointer',
                        padding: 0,
                        textDecoration: 'underline'
                      }}
                    >
                      {showAdvancedToken ? 'Hide manual JWT token input' : 'Advanced: Paste raw Google JWT credential token'}
                    </button>

                    {showAdvancedToken && (
                      <form onSubmit={handleGoogleTokenSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                        <input
                          type="text"
                          value={googleCredentialInput}
                          onChange={(e) => setGoogleCredentialInput(e.target.value)}
                          placeholder="Paste Google JWT credential string (eyJhbGci...)"
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            backgroundColor: OsakaJadePalette.background.canvas,
                            border: `1px solid ${OsakaJadePalette.border.default}`,
                            borderRadius: 6,
                            padding: '7px 10px',
                            color: OsakaJadePalette.text.primary,
                            fontSize: 11,
                            outline: 'none'
                          }}
                        />
                        <button
                          type="submit"
                          disabled={!googleCredentialInput.trim() || isSubmitting}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 6,
                            backgroundColor: googleCredentialInput.trim() ? OsakaJadePalette.jade[600] : 'rgba(255,255,255,0.05)',
                            border: 'none',
                            color: '#fff',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: googleCredentialInput.trim() ? 'pointer' : 'default'
                          }}
                        >
                          Authenticate Google Token
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
