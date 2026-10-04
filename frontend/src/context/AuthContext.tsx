import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import type { Perfil } from "@/types/schemas";
import { authService } from "@/services/authService";
interface AuthState {
  user: User | null;
  perfil: Perfil | null;
  loading: boolean;
  error: string | null;
}
const AuthContext = createContext<
  (AuthState & { retry: () => void; signOut: () => Promise<void> }) | null
>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    perfil: null,
    loading: true,
    error: null,
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true,
      version = 0;
    async function sync(user: User | null) {
      const request = ++version;
      if (!user) {
        if (active)
          setState({ user: null, perfil: null, loading: false, error: null });
        return;
      }
      setState({ user, perfil: null, loading: true, error: null });
      try {
        const perfil = await authService.perfil(user.id);
        if (active && request === version)
          setState({ user, perfil, loading: false, error: null });
      } catch (error) {
        if (active && request === version)
          setState({
            user,
            perfil: null,
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "No pudimos verificar tu acceso.",
          });
      }
    }
    // Keep Supabase API calls outside the synchronous auth event callback.
    const subscription = authService.subscribe(async (_event, session) => {
      queueMicrotask(() => {
        if (active) void sync(session?.user ?? null);
      });
    });
    const initialVersion = version;
    authService
      .session()
      .then((session) => {
        if (active && version === initialVersion)
          void sync(session?.user ?? null);
      })
      .catch(() => {
        if (active && version === initialVersion)
          setState({
            user: null,
            perfil: null,
            loading: false,
            error:
              "No pudimos recuperar tu sesión. Recarga la página para volver a intentar.",
          });
      });
    return () => {
      active = false;
      version++;
      subscription.unsubscribe();
    };
  }, [attempt]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return (
    <AuthContext.Provider
      value={{ ...state, retry, signOut: authService.signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider requerido");
  return context;
}
