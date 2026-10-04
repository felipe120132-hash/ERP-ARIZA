import { test, expect, type Page } from "@playwright/test";
import { mock, api, products, now } from "./fixtures";
const movements = Array.from({ length: 21 }, (_, i) => ({
  id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`,
  producto_id: products[0].id,
  remision_id: i === 0 ? "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" : null,
  tipo_movimiento: i === 20 ? "AJUSTE" : "SALIDA",
  cantidad: 2,
  stock_resultante: 100 - i,
  observacion: `Movimiento ${i}`,
  created_at: now,
}));
async function setup(page: Page) {
  await mock(page);
  const writes: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/rest/v1/") && r.method() !== "GET")
      writes.push(r.method());
  });
  await page.route(`${api}/rest/v1/productos*`, (r) =>
    r.fulfill({
      json: r.request().url().includes("id=eq.") ? products[0] : products,
    }),
  );
  await page.route(`${api}/rest/v1/kardex*`, (r) => {
    const url = new URL(r.request().url());
    expect(url.searchParams.get("producto_id")).toBe(`eq.${products[0].id}`);
    const tipo = url.searchParams.get("tipo_movimiento")?.replace("eq.", "");
    const filtered = movements.filter(
      (x) => !tipo || x.tipo_movimiento === tipo,
    );
    const offset = Number(url.searchParams.get("offset") || 0);
    const rows = filtered.slice(offset, offset + 20);
    return r.fulfill({
      json: rows,
      headers: {
        "access-control-expose-headers": "content-range",
        "content-range": `${offset}-${offset + rows.length - 1}/${filtered.length}`,
      },
    });
  });
  return writes;
}
test("inventario filtra estado del backend, tildes e inactivos sin escrituras", async ({
  page,
}) => {
  const writes = await setup(page);
  await page.goto("/inventario");
  await expect(page.locator("tbody tr")).toHaveCount(14);
  await page
    .getByLabel("Estado de stock", { exact: true })
    .selectOption("ROJO");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByLabel("Buscar producto en inventario").fill("cafe");
  await expect(page.locator("tbody")).toContainText("Café de origen");
  await page.reload();
  await expect(page.getByLabel("Buscar producto en inventario")).toHaveValue(
    "cafe",
  );
  await page.goto("/inventario?actividad=inactivos");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Producto 14");
  expect(writes).toEqual([]);
});
test("alertas fallidas no presentan un filtro vacío como resultado válido", async ({
  page,
}) => {
  await setup(page);
  await page.route(`${api}/rest/v1/vista_alertas_stock*`, (r) =>
    r.fulfill({ status: 500, json: { message: "Error de consulta" } }),
  );
  await page.goto("/inventario?estado=ROJO");
  await expect(
    page.getByText("No se puede evaluar el filtro de estado"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Mostrar existencias sin filtrar por estado" })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(14);
  await expect(page.locator("tbody tr").first()).toContainText(
    "Sin estado disponible",
  );
});
test("alertas incompletas conservan estado desconocido", async ({ page }) => {
  await setup(page);
  await page.route(`${api}/rest/v1/vista_alertas_stock*`, (r) =>
    r.fulfill({ json: [] }),
  );
  await page.goto("/inventario?estado=sin-estado");
  await expect(page.locator("tbody tr")).toHaveCount(14);
  await expect(page.locator(".catalog-stats").nth(0)).toContainText("—");
});
test("kardex pagina y filtra en servidor conservando cifras y referencias", async ({
  page,
}) => {
  const writes = await setup(page);
  await page.goto(`/inventario/${products[0].id}`);
  await expect(page.locator("tbody tr")).toHaveCount(20);
  await expect(page.locator("tbody tr").first()).toContainText("100");
  await expect(
    page.getByRole("link", { name: "Ver remisión" }),
  ).toHaveAttribute("href", "/remisiones/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Movimiento 20");
  await page.getByLabel("Tipo de movimiento").selectOption("AJUSTE");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page).not.toHaveURL(/pagina=/);
  await expect(page.locator("tbody")).toContainText("Sin remisión asociada");
  expect(writes).toEqual([]);
});
test("kardex muestra error de lectura y permite reintentar", async ({
  page,
}) => {
  await setup(page);
  let failed = true;
  await page.route(`${api}/rest/v1/kardex*`, async (r) => {
    if (failed) {

      await r.fulfill({
        status: 500,
        json: { message: "Historial no disponible" },
      });
    } else await r.fallback();
  });
  await page.goto(`/inventario/${products[0].id}`);
  await expect(page.getByRole("alert")).toBeVisible();
  failed = false;
  await page.getByRole("button", { name: "Reintentar movimientos" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(20);
});
test("identificador inválido no consulta movimientos", async ({ page }) => {
  await setup(page);
  let requests = 0;
  page.on("request", (r) => {
    if (r.url().includes("/kardex")) requests++;
  });
  await page.goto("/inventario/invalido");
  await expect(page.getByRole("alert")).toContainText("no es válido");
  expect(requests).toBe(0);
});
test("inventario y kardex adaptables a móvil", async ({ page }) => {
  await setup(page);
  await page.goto("/inventario");
  await expect(page.locator("tbody tr")).toHaveCount(14);
  await page.screenshot({
    path: "output/frontend/inventario-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/inventario/${products[0].id}`);
  await expect(page.locator("tbody tr")).toHaveCount(20);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "output/frontend/kardex-mobile.png",
    fullPage: true,
  });
});
