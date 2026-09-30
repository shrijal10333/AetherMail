import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { api } from '../services/api';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  signup: (credentials: { email: string; password: string; name?: string }) => Promise<void>;
  changePassword: (data: { currentPassword: string; newPassword: string }) => Promise<void>;
  logout: () => Promise<void>;
  regenerateApiKey: () => Promise<string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = async () => {
    try {
      const data = await api.getMe();
      if (data.user) {
        setUser(data.user);
      }
    } catch {
      // Guest mode
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const login = async (credentials: { email: string; password: string }) => {
    const loggedInUser = await api.login(credentials);
    setUser(loggedInUser);
  };

  const signup = async (credentials: { email: string; password: string; name?: string }) => {
    const newUser = await api.signup(credentials);
    setUser(newUser);
  };

  const changePassword = async (data: { currentPassword: string; newPassword: string }) => {
    await api.changePassword(data);
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
  };

  const regenerateApiKey = async () => {
    const newKey = await api.regenerateApiKey();
    if (user) {
      setUser({ ...user, apiKey: newKey });
    }
    return newKey;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        signup,
        changePassword,
        logout,
        regenerateApiKey,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
