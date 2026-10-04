import { test, expect } from "@playwright/test";
import { mock } from "./fixtures";
test("ruta protegida, login y error de credenciales", async ({ page }) => {
  await mock(page, { session: false });
  await page.goto("/catalogo");
  await expect(page).toHaveURL(/login/);
  await page.screenshot({
    path: "output/frontend/login-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("Correo electrónico").fill("prueba@example.com");
  await page.getByLabel("Contraseña", { exact: true }).fill("incorrecta");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByRole("alert")).toContainText("no son correctos");
});
test("catálogo: búsqueda, filtros, precio, paginación y detalle", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/catalogo");
  await expect(
    page.getByRole("heading", { name: "Todo listo para vender." }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(12);
  await page.screenshot({
    path: "output/frontend/catalogo-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Página siguiente" }).click();
  await expect(page.getByRole("article")).toHaveCount(2);
  await page.getByLabel("Buscar producto o SKU").fill("cafe");
  await expect(page.getByRole("article")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Ver detalle de Café de origen" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Tasa de IVA");
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.getByLabel("Tipo de precio").click();
  await page.getByRole("option", { name: "Distribuidor", exact: true }).click();
  await expect(page.getByRole("article")).toContainText("16.000");
  await page.getByRole("button", { name: "Limpiar filtros" }).click();
  await expect(page.getByLabel("Buscar producto o SKU")).toHaveValue("");
  await expect(page.getByRole("article")).toHaveCount(12);
  await page.getByLabel("Categoría", { exact: true }).click();
  await page.getByRole("option", { name: "Alimentos", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(7);
  await page.reload();
  await expect(page.getByRole("article")).toHaveCount(7);
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/login/);
});
test("vendedor: navegación móvil y acceso financiero", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page, { role: "VENDEDOR" });
  await page.goto("/catalogo");
  await expect(page.getByRole("article")).toHaveCount(12);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "output/frontend/catalogo-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Finanzas y gastos" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Cartera y clientes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/finanzas");
  await expect(
    page.getByRole("heading", { name: "Acceso restringido" }),
  ).toBeVisible();
});
test("perfil inactivo no entra al catálogo", async ({ page }) => {
  await mock(page, { active: false });
  await page.goto("/catalogo");
  await expect(page.getByRole("alert")).toContainText("desactivada");
  await expect(page.getByRole("article")).toHaveCount(0);
});
test("error de catálogo permite reintento", async ({ page }) => {
  await mock(page, { error: true });
  await page.goto("/catalogo");
  await expect(
    page.getByRole("heading", { name: "No pudimos cargar el catálogo" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Volver a intentar" }),
  ).toBeVisible();
});
