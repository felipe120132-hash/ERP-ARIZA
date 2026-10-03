import React, { createContext, useEffect, useState, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';
import { perfilSchema, type Perfil, type RolUsuario } from '../types/schemas';
import { parsearErrorSupabase } from '../services/errorHandler';

export interface AuthContextType {
  user: User | null;
  perfil: Perfil | null;
  rol: RolUsuario | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ data: User | null; error: string | null }>;
  signOut: () => Promise<{ error: string | null }>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchPerfil = useCallback(async (userId: string): Promise<Perfil | null> => {
    try {
      const { data, error } = await supabase
        .from('perfiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error || !data) {
        console.error('Error al consultar perfil:', error?.message);
        return null;
      }

      const parsed = perfilSchema.safeParse(data);
      if (!parsed.success) {
        console.error('Error de validación en perfil:', parsed.error.issues);
        return null;
      }

      return parsed.data;
    } catch (err) {
      console.error('Excepción al consultar perfil:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('Error al inicializar sesión:', error.message);
        }

        if (session?.user && isMounted) {
          setUser(session.user);
          const userPerfil = await fetchPerfil(session.user.id);
          if (isMounted) {
            setPerfil(userPerfil);
          }
        }
      } catch (err) {
        console.error('Error inesperado al cargar sesión inicial:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session: Session | null) => {
        if (session?.user) {
          setUser(session.user);
          const userPerfil = await fetchPerfil(session.user.id);
          if (isMounted) {
            setPerfil(userPerfil);
          }
        } else {
          if (isMounted) {
            setUser(null);
            setPerfil(null);
          }
        }
        if (isMounted) {
          setLoading(false);
        }
      },
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchPerfil]);

  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setLoading(false);
        return { data: null, error: parsearErrorSupabase(error) };
      }

      if (data.user) {
        setUser(data.user);
        const userPerfil = await fetchPerfil(data.user.id);
        setPerfil(userPerfil);
        setLoading(false);
        return { data: data.user, error: null };
      }

      setLoading(false);
      return { data: null, error: 'No se pudo obtener el usuario autenticado.' };
    } catch (err) {
      setLoading(false);
      return { data: null, error: parsearErrorSupabase(err) };
    }
  };

  const signOut = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signOut();
      setUser(null);
      setPerfil(null);
      setLoading(false);

      if (error) {
        return { error: parsearErrorSupabase(error) };
      }
      return { error: null };
    } catch (err) {
      setLoading(false);
      return { error: parsearErrorSupabase(err) };
    }
  };

  const rol: RolUsuario | null = perfil?.rol ?? null;

  return (
    <AuthContext.Provider
      value={{
        user,
        perfil,
        rol,
        loading,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
