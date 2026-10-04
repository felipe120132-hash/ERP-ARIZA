import { test, expect, type Page } from "@playwright/test";
import { loadEnvFile } from "node:process";
loadEnvFile(".env.local");
const api = process.env.VITE_SUPABASE_URL!;
const project = new URL(api).hostname.split(".")[0];
const id = "11111111-1111-4111-8111-111111111111";
const now = new Date().toISOString();
const user = {
  id,
  email: "prueba@example.com",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: now,
};
const products = Array.from({ length: 15 }, (_, i) => ({
  id: `22222222-2222-4222-8222-${String(i).padStart(12, "0")}`,
  sku: `AR-${i}`,
  nombre: i === 0 ? "Café de origen" : `Producto ${i}`,
  categoria: i % 2 ? "Alimentos" : "Líquidos",
  origen: i % 2 ? "Nacional" : "China",
  precio_tienda: 18000 + i,
  precio_distribuidor: 16000 + i,
  tasa_iva: 19,
  imagen_path: null,
  stock_actual: 10 + i,
  stock_minimo: 10,
  activo: i !== 14,
  created_at: now,
  updated_at: now,
}));
async function mock(
  page: Page,
  { role = "ADMIN", active = true, session = true, error = false } = {},
) {
  if (session)
    await page.addInitScript(
      ({ key, user }) =>
        localStorage.setItem(
          key,
          JSON.stringify({
            access_token: "test-token",
            refresh_token: "test-refresh",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            expires_in: 3600,
            token_type: "bearer",
            user,
          }),
        ),
      { key: `sb-${project}-auth-token`, user },
    );
  await page.route(`${api}/**`, async (route) => {
    const url = route.request().url();
    const json = url.includes("/perfiles")
      ? {
          id,
          nombre_completo: "Ana Ariza",
          rol: role,
          activo: active,
          created_at: now,
        }
      : url.includes("/vista_alertas_stock")
        ? products.map((p) => ({
            id: p.id,
            sku: p.sku,
            nombre: p.nombre,
            categoria: p.categoria,
            stock_actual: p.stock_actual,
            stock_minimo: p.stock_minimo,
            semaforo: p.sku === "AR-0" ? "ROJO" : "VERDE",
          }))
        : url.includes("/productos")
          ? products
          : url.includes("/logout")
            ? {}
            : url.includes("/token")
              ? {
                  error_code: "invalid_credentials",
                  msg: "Invalid login credentials",
                }
              : user;
    await route.fulfill({
      status: url.includes("/token")
        ? 400
        : error && url.includes("/productos")
          ? 500
          : 200,
      contentType: "application/json",
      body: JSON.stringify(
        error && url.includes("/productos")
          ? { message: "Error de conexión", code: "500" }
          : json,
      ),
    });
  });
}

export { mock, api, products, id, now };
