import React, { createContext, useEffect, useState, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';
import { perfilSchema, type Perfil, type RolUsuario } from '../types/schemas';
import { parsearErrorSupabase } from '../services/errorHandler';
import {
  CLAVE_ULTIMA_ACTIVIDAD,
  CLAVE_INICIO_SESION,
  CLAVE_LOGOUT_EVENTO,
  CLAVE_MENSAJE_LOGOUT,
  comprobarExpiracionSesion,
  limpiarClavesSesionAriza,
} from '../config/sesion';

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
          // Requisito 4: Al recargar página o abrir pestaña con sesión existente,
          // comprobar si la sesión ya expiró antes de renderizar pantallas protegidas.
          const estado = comprobarExpiracionSesion(session.user);
          if (estado.expirada) {
            limpiarClavesSesionAriza();
            if (estado.mensaje) {
              try {
                sessionStorage.setItem(CLAVE_MENSAJE_LOGOUT, estado.mensaje);
              } catch {
                // ignore
              }
            }
            await supabase.auth.signOut();
            if (isMounted) {
              setUser(null);
              setPerfil(null);
              setLoading(false);
            }
            return;
          }

          // Si la sesión es válida y no había marca de actividad, inicializarla
          if (!localStorage.getItem(CLAVE_ULTIMA_ACTIVIDAD)) {
            const ahora = Date.now().toString();
            try {
              localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD, ahora);
              if (!localStorage.getItem(CLAVE_INICIO_SESION)) {
                localStorage.setItem(CLAVE_INICIO_SESION, ahora);
              }
            } catch {
              // ignore
            }
          }

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
      async (event, session: Session | null) => {
        if (session?.user) {
          // Requisito 3: al hacer login correcto, registrar/reiniciar actividad
          if (event === 'SIGNED_IN') {
            const ahora = Date.now().toString();
            try {
              localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD, ahora);
              localStorage.setItem(CLAVE_INICIO_SESION, ahora);
            } catch {
              // ignore
            }
          }

          setUser(session.user);
          const userPerfil = await fetchPerfil(session.user.id);
          if (isMounted) {
            setPerfil(userPerfil);
          }
        } else {
          // Requisito 3: al cerrar sesión, limpiar todas las claves ariza_*
          limpiarClavesSesionAriza();
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
        // Requisito 3: reiniciar ariza_ultima_actividad e inicio de sesión al hacer login correcto
        const ahora = Date.now().toString();
        try {
          localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD, ahora);
          localStorage.setItem(CLAVE_INICIO_SESION, ahora);
        } catch {
          // ignore
        }

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

      // Requisito 2 y 3: Notificar a otras pestañas y limpiar todas las claves ariza_*
      try {
        localStorage.setItem(
          CLAVE_LOGOUT_EVENTO,
          JSON.stringify({ timestamp: Date.now(), motivo: 'manual' })
        );
      } catch {
        // ignore
      }

      limpiarClavesSesionAriza();

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
