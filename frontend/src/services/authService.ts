import { supabase } from "./supabaseClient";
import { perfilSchema } from "../types/schemas";
import { parsearErrorSupabase } from "./errorHandler";
export const authService = {
  async session() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  },
  subscribe(callback: Parameters<typeof supabase.auth.onAuthStateChange>[0]) {
    return supabase.auth.onAuthStateChange(callback).data.subscription;
  },
  async perfil(id: string) {
    const { data, error } = await supabase
      .from("perfiles")
      .select("*")
      .eq("id", id)
      .single();
    if (error)
      throw new Error(
        "No pudimos cargar tu perfil. Intenta nuevamente o contacta al administrador.",
      );
    const result = perfilSchema.safeParse(data);
    if (!result.success)
      throw new Error(
        "Tu perfil no tiene un formato válido. Contacta al administrador.",
      );
    if (!result.data.activo)
      throw new Error("Tu cuenta está desactivada. Contacta al administrador.");
    return result.data;
  },
  async signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error)
      return error.code === "invalid_credentials"
        ? "El correo o la contraseña no son correctos."
        : parsearErrorSupabase(error);
    return null;
  },
  async signOut() {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw new Error(parsearErrorSupabase(error));
  },
};
