import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  getUserSession,
  loginUser,
  registerUser,
  loginWithPassword,
  loginWithGoogleCredential as doLoginWithGoogleCredential,
  logoutUser,
  updateUserProfile,
  type UserSession
} from './accountManager.js';
import { signInWithGoogleOnDesktop } from './desktopGoogleSignIn.js';

interface AccountContextValue {
  user: UserSession | null;
  isAuthenticated: boolean;
  isAccountModalOpen: boolean;
  openAccountModal: () => void;
  closeAccountModal: () => void;
  register: (credentials: {
    email: string;
    password: string;
    name?: string;
    organization?: string;
  }) => Promise<UserSession>;
  login: (credentials: {
    email: string;
    password: string;
  }) => Promise<UserSession>;
  signIn: (
    provider: 'github' | 'google' | 'microsoft' | 'email',
    details?: { email?: string; name?: string; organization?: string; avatarUrl?: string }
  ) => Promise<UserSession>;
  signInWithGoogleCredential: (credentialToken: string) => Promise<UserSession | null>;
  /** Desktop only: system browser + loopback. See desktopGoogleSignIn.ts. */
  signInWithGoogleDesktop: () => Promise<UserSession>;
  signOut: () => void;
  updateProfile: (updates: Partial<UserSession>) => void;
}

const AccountContext = createContext<AccountContextValue | undefined>(undefined);

export interface AccountProviderProps {
  children: ReactNode;
}

export const AccountProvider: React.FC<AccountProviderProps> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(() => getUserSession());
  const [isAccountModalOpen, setIsAccountModalOpen] = useState<boolean>(false);

  useEffect(() => {
    const session = getUserSession();
    if (session) {
      setUser(session);
    }
  }, []);

  const openAccountModal = () => setIsAccountModalOpen(true);
  const closeAccountModal = () => setIsAccountModalOpen(false);

  const register = async (credentials: {
    email: string;
    password: string;
    name?: string;
    organization?: string;
  }) => {
    const session = await registerUser(credentials);
    setUser(session);
    return session;
  };

  const login = async (credentials: {
    email: string;
    password: string;
  }) => {
    const session = await loginWithPassword(credentials);
    setUser(session);
    return session;
  };

  const signIn = async (
    provider: 'github' | 'google' | 'microsoft' | 'email',
    details?: { email?: string; name?: string; organization?: string; avatarUrl?: string }
  ) => {
    const session = await loginUser(provider, details);
    setUser(session);
    return session;
  };

  const signInWithGoogleCredential = async (credentialToken: string) => {
    const session = await doLoginWithGoogleCredential(credentialToken);
    if (session) {
      setUser(session);
    }
    return session;
  };

  const signInWithGoogleDesktop = async () => {
    const session = await signInWithGoogleOnDesktop();
    setUser(session);
    return session;
  };

  const signOut = () => {
    logoutUser();
    setUser(null);
  };

  const updateProfile = (updates: Partial<UserSession>) => {
    const updated = updateUserProfile(updates);
    if (updated) {
      setUser(updated);
    }
  };

  return (
    <AccountContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAccountModalOpen,
        openAccountModal,
        closeAccountModal,
        register,
        login,
        signIn,
        signInWithGoogleCredential,
        signInWithGoogleDesktop,
        signOut,
        updateProfile
      }}
    >
      {children}
    </AccountContext.Provider>
  );
};

export function useAccount(): AccountContextValue {
  const context = useContext(AccountContext);
  if (!context) {
    throw new Error('useAccount must be used within an AccountProvider');
  }
  return context;
}
