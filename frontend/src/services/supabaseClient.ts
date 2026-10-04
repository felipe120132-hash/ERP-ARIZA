import { createClient } from "@supabase/supabase-js";

/**
 * Fail-fast: si alguna variable de entorno falta, lanza un error al cargar el
 * módulo — no en silencio más adelante cuando el primer call falle con un
 * mensaje críptico.
 *
 * Para configurar las variables:
 *   1. Copia .env.example → .env
 *   2. Completa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY con los valores de
 *      tu proyecto en https://supabase.com/dashboard/project/<tu-proyecto>/settings/api
 *
 * IMPORTANTE: Usa siempre la clave pública (anon key), NUNCA la service_role key
 * en el frontend — esa key bypasea las RLS y solo debe vivir en Edge Functions.
 */
function getRequiredEnv(key: string): string {
  const globalProcess = (
    globalThis as unknown as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process;
  const value =
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env[key]) ||
    (globalProcess?.env && globalProcess.env[key]);

  if (!value || typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `[ArizaERP] Variable de entorno requerida "${key}" no encontrada o vacía.\n` +
        `Asegúrate de haber creado el archivo .env a partir de .env.example y de haber completado todas las variables.`,
    );
  }
  return value.trim();
}

const supabaseUrl = getRequiredEnv("VITE_SUPABASE_URL");
const supabaseAnonKey = getRequiredEnv("VITE_SUPABASE_ANON_KEY");

/**
 * Instancia singleton del cliente de Supabase.
 * Es la ÚNICA forma de hablar con Supabase en toda la app.
 * Ningún componente ni página debe importar este módulo directamente —
 * siempre a través de los archivos en src/services/.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
