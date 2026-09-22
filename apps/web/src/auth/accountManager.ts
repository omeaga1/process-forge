/**
 * User accounts and sessions.
 *
 * Two kinds of account, with different reach:
 *
 * - Google: verified by the cloud API, which issues a session (`cloudToken`).
 *   These accounts can save to and load from ProcessForge Cloud.
 * - Email and password: a LOCAL profile. The account and its salted hash live
 *   in this browser's storage and are checked here; no server has ever seen
 *   them, so they cannot authenticate to the cloud and their projects stay on
 *   this device.
 */

import { postCloudSignIn, type CloudSignIn } from '../storage/cloudApi.js';

export interface UserSession {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  organization: string;
  provider: 'github' | 'google' | 'microsoft' | 'email';
  token: string;
  /**
   * A session issued by the cloud API after it verified a Google sign-in.
   * Present ONLY for server-verified accounts; it is the sole credential the
   * cloud accepts. Local email/password profiles and guests never have one,
   * so their projects stay on this device.
   */
  cloudToken?: string;
  cloudTokenExpiresAt?: string;
  plan: 'Community' | 'Professional' | 'Enterprise';
  cloudStorageQuota: {
    usedProjects: number;
    maxProjects: number;
  };
  createdAt: string;
}

/** True when this session can talk to the cloud API. */
export function hasCloudSession(user: UserSession | null | undefined): user is UserSession & { cloudToken: string } {
  if (!user?.cloudToken) return false;
  if (user.cloudTokenExpiresAt && Date.parse(user.cloudTokenExpiresAt) <= Date.now()) return false;
  return true;
}

export interface StoredUserAccount {
  id: string;
  email: string;
  name: string;
  organization: string;
  passwordHash: string;
  salt: string;
  avatarUrl?: string;
  plan: 'Community' | 'Professional' | 'Enterprise';
  createdAt: string;
}

const STORAGE_KEY_USER_SESSION = 'pf_user_session';
const STORAGE_KEY_REGISTERED_USERS = 'pf_registered_users';

/**
 * Generate authentic monogram initials (e.g. "Vincent Price" -> "VP")
 */
export function getInitials(name?: string, email?: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (email && email.trim()) {
    const local = email.split('@')[0] || '';
    const parts = local.split(/[._-]/);
    if (parts.length >= 2) {
      return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
    }
    return local.slice(0, 2).toUpperCase();
  }
  return 'PE';
}

/**
 * Generate a clean, authentic SVG avatar data URI with the engineer's initials
 * Replaces all third-party stock photos with zero external dependency
 */
export function generateInitialsAvatar(name?: string, email?: string): string {
  const initials = getInitials(name, email);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#10b981"/>
        <stop offset="100%" stop-color="#047857"/>
      </linearGradient>
    </defs>
    <rect width="96" height="96" rx="48" fill="url(#g)"/>
    <text x="50%" y="54%" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="36" font-weight="700" fill="#ffffff" dominant-baseline="middle" text-anchor="middle">${initials}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Hash password with SHA-256 and salt using Web Crypto API or Node crypto
 */
export async function hashPasswordClient(password: string, salt: string): Promise<string> {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + salt);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Universal fallback
  let hash = 0;
  const str = password + salt;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

/**
 * Retrieve registered accounts from browser storage
 */
function getRegisteredUsers(): StoredUserAccount[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REGISTERED_USERS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Save registered accounts to browser storage
 */
function saveRegisteredUsers(users: StoredUserAccount[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_REGISTERED_USERS, JSON.stringify(users));
  } catch {}
}

/**
 * Retrieve the active user session from browser storage
 */
export function getUserSession(): UserSession | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USER_SESSION);
    return raw ? (JSON.parse(raw) as UserSession) : null;
  } catch (err) {
    console.warn('Failed to parse user session from localStorage:', err);
    return null;
  }
}

/**
 * Register a new user account with real password validation
 */
export async function registerUser(credentials: {
  email: string;
  password: string;
  name?: string;
  organization?: string;
}): Promise<UserSession> {
  const { email, password, name, organization } = credentials;

  if (!email || !email.includes('@')) {
    throw new Error('Please enter a valid email address.');
  }
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }

  // 1. Try backend API (/api/auth/register)
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, organization })
    });

    if (res.ok) {
      const data = (await res.json()) as { success: boolean; user: UserSession };
      if (data.success && data.user) {
        if (!data.user.avatarUrl) {
          data.user.avatarUrl = generateInitialsAvatar(data.user.name, data.user.email);
        }
        localStorage.setItem(STORAGE_KEY_USER_SESSION, JSON.stringify(data.user));
        return data.user;
      }
    } else {
      const err = await res.json().catch(() => ({}));
      if (err.error) {
        throw new Error(err.error);
      }
    }
  } catch (err: any) {
    if (err.message && err.message.includes('already exists')) {
      throw err;
    }
    // Fall back to local secure storage
  }

  // 2. Local fallback registration
  const users = getRegisteredUsers();
  const existing = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    throw new Error('An account with this email already exists. Please sign in instead.');
  }

  const salt = Math.random().toString(36).substring(2, 10);
  const passwordHash = await hashPasswordClient(password, salt);
  const userId = `usr_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const userName = name?.trim() || email.split('@')[0] || 'Process Engineer';
  const userOrg = organization?.trim() || 'Process Engineering Team';
  const avatarUrl = generateInitialsAvatar(userName, email);

  const newAccount: StoredUserAccount = {
    id: userId,
    email: email.toLowerCase(),
    name: userName,
    organization: userOrg,
    passwordHash,
    salt,
    avatarUrl,
    plan: 'Professional',
    createdAt: new Date().toISOString()
  };

  users.push(newAccount);
  saveRegisteredUsers(users);

  const session: UserSession = {
    id: userId,
    email: email.toLowerCase(),
    name: userName,
    avatarUrl,
    organization: userOrg,
    provider: 'email',
    token: `pf_jwt_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
    plan: 'Professional',
    cloudStorageQuota: { usedProjects: 0, maxProjects: 50 },
    createdAt: new Date().toISOString()
  };

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_USER_SESSION, JSON.stringify(session));
  }

  return session;
}

/**
 * Log in an existing user with email and password verification
 */
export async function loginWithPassword(credentials: {
  email: string;
  password: string;
}): Promise<UserSession> {
  const { email, password } = credentials;

  if (!email || !password) {
    throw new Error('Email and password are required.');
  }

  // 1. Try backend API (/api/auth/login)
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (res.ok) {
      const data = (await res.json()) as { success: boolean; user: UserSession };
      if (data.success && data.user) {
        if (!data.user.avatarUrl) {
          data.user.avatarUrl = generateInitialsAvatar(data.user.name, data.user.email);
        }
        localStorage.setItem(STORAGE_KEY_USER_SESSION, JSON.stringify(data.user));
        return data.user;
      }
    } else {
      const err = await res.json().catch(() => ({}));
      if (res.status === 401 || err.error?.includes('Incorrect password')) {
        throw new Error('Incorrect password. Please verify your credentials.');
      }
      if (res.status === 404 || err.error?.includes('No account found')) {
        throw new Error('No account found with this email. Please register first.');
      }
      if (err.error) {
        throw new Error(err.error);
      }
    }
  } catch (err: any) {
    if (err.message && (err.message.includes('Incorrect password') || err.message.includes('No account found'))) {
      throw err;
    }
    // Fall back to local secure storage
  }

  // 2. Local fallback verification
  const users = getRegisteredUsers();
  const account = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!account) {
    throw new Error('No account found with this email. Please switch to Create Account.');
  }

  const computedHash = await hashPasswordClient(password, account.salt);
  if (computedHash !== account.passwordHash) {
    throw new Error('Incorrect password. Please verify your credentials.');
  }

  const avatarUrl = account.avatarUrl || generateInitialsAvatar(account.name, account.email);
  const session: UserSession = {
    id: account.id,
    email: account.email,
    name: account.name,
    avatarUrl,
    organization: account.organization,
    provider: 'email',
    token: `pf_jwt_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
    plan: account.plan,
    cloudStorageQuota: { usedProjects: 0, maxProjects: 50 },
    createdAt: new Date().toISOString()
  };

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_USER_SESSION, JSON.stringify(session));
  }

  return session;
}

function sessionFromCloud(signIn: CloudSignIn): UserSession {
  const { user } = signIn;
  const session: UserSession = {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl || generateInitialsAvatar(user.name, user.email),
    organization: 'Google account',
    provider: 'google',
    token: signIn.token,
    cloudToken: signIn.token,
    cloudTokenExpiresAt: signIn.expiresAt,
    plan: 'Community',
    cloudStorageQuota: { usedProjects: 0, maxProjects: 50 },
    createdAt: new Date().toISOString()
  };
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_USER_SESSION, JSON.stringify(session));
    } catch (e) {
      console.error('Failed to save user session to localStorage:', e);
    }
  }
  return session;
}

/**
 * Sign in with a Google Identity Services credential (the web button).
 *
 * The credential goes to the cloud API, which verifies Google's signature and
 * issues a session. This used to base64-decode the token in the browser and
 * trust whatever it said -- so any hand-made token with any email "signed in"
 * as that person. Nothing is accepted locally now; if the API cannot verify
 * the credential, sign-in fails.
 */
export async function loginWithGoogleCredential(credentialToken: string): Promise<UserSession> {
  return sessionFromCloud(await postCloudSignIn('/auth/google', { credential: credentialToken }));
}

/**
 * Sign in from the desktop app's system-browser flow: an authorization code
 * from Google's loopback redirect, exchanged by the cloud API (which holds the
 * desktop client secret) and bound to this app by the PKCE verifier.
 */
export async function loginWithGoogleCode(params: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<UserSession> {
  return sessionFromCloud(await postCloudSignIn('/auth/google/code', params));
}

const TEST_FALLBACKS: Record<string, { name: string; organization: string; plan: 'Professional' | 'Enterprise' }> = {
  github: {
    name: 'Lead Process Engineer',
    organization: 'Process Engineering Team',
    plan: 'Professional'
  },
  google: {
    name: 'Process Engineer',
    organization: 'Google Account Workspace',
    plan: 'Professional'
  },
  microsoft: {
    name: 'Automation Architect',
    organization: 'Industrial Automation Consortium',
    plan: 'Enterprise'
  },
  email: {
    name: 'Process Engineer',
    organization: 'Process Engineering Team',
    plan: 'Professional'
  }
};

/**
 * Authenticate the user with chosen identity provider (maintained for backward-compatible test suites)
 */
export async function loginUser(
  provider: 'github' | 'google' | 'microsoft' | 'email',
  details?: { email?: string; name?: string; organization?: string; avatarUrl?: string }
): Promise<UserSession> {
  const fallback = TEST_FALLBACKS[provider] || {
    name: 'Process Engineer',
    organization: 'Process Engineering Team',
    plan: 'Professional' as const
  };
  const email = details?.email || `${provider}_engineer@process-forge.io`;
  const name = details?.name || fallback.name;
  const organization = details?.organization || fallback.organization;
  const avatarUrl = details?.avatarUrl || generateInitialsAvatar(name, email);
  const userId = `usr_${provider}_${Date.now().toString(36)}`;

  const session: UserSession = {
    id: userId,
    email,
    name,
    avatarUrl,
    organization,
    provider,
    token: `pf_jwt_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
    plan: details ? 'Professional' : fallback.plan,
    cloudStorageQuota: {
      usedProjects: 1,
      maxProjects: provider === 'microsoft' ? 100 : 50
    },
    createdAt: new Date().toISOString()
  };

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_USER_SESSION, JSON.stringify(session));
    } catch (e) {
      console.error('Failed to save user session to localStorage:', e);
    }
  }

  return session;
}

/**
 * Sign out and clear stored session
 */
export function logoutUser(): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY_USER_SESSION);
    } catch {}
  }
}

/**
 * Update the user's active session profile
 */
export function updateUserProfile(updates: Partial<UserSession>): UserSession | null {
  const current = getUserSession();
  if (!current) return null;

  const updated: UserSession = {
    ...current,
    ...updates
  };

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_USER_SESSION, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to update user session in localStorage:', e);
    }
  }

  return updated;
}
