import React, { createContext, useState } from 'react';
import type { RolUsuario } from '../types/database.types';

export interface UserProfile {
  id: string;
  email?: string;
  rol: RolUsuario;
  nombre_completo?: string;
}

export interface AuthContextType {
  user: UserProfile | null;
  rol: RolUsuario | null;
  isLoading: boolean;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  rol: null,
  isLoading: false,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user] = useState<UserProfile | null>(null);
  const [rol] = useState<RolUsuario | null>(null);
  const [isLoading] = useState<boolean>(false);

  return (
    <AuthContext.Provider value={{ user, rol, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};
