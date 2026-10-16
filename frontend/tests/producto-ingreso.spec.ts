import { test, expect, type Page } from "@playwright/test";
import { mock, api, products } from "./fixtures";
async function setup(page: Page, failure: "none" | "product" | "entry" = "none") {
  await mock(page);
  let product = { ...products[0], stock_actual: 0 };
  let creates = 0;
  const movements: any[] = [];
  await page.route(`${api}/rest/v1/productos*`, async route => {
    if (route.request().method() === "POST") {
      creates++; product = { ...product, ...route.request().postDataJSON() };
      if (failure === "product") return route.abort();
    }
    await route.fulfill({ json: product });
  });
  await page.route(`${api}/rest/v1/rpc/registrar_movimiento_inventario`, async route => {
    const body = route.request().postDataJSON(); movements.push(body);
    product.stock_actual = body.p_cantidad;
    if (failure === "entry" && movements.length === 1) return route.abort();
    await route.fulfill({ json: { kardex_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", producto_id: product.id, tipo_movimiento: "ENTRADA", cantidad: body.p_cantidad, stock_anterior: 0, stock_resultante: body.p_cantidad, repetido: movements.length > 1 } });
  });
  await page.goto("/productos/nuevo");
  await page.getByLabel("SKU", { exact: true }).fill("SKU-20");
  await page.getByLabel("Nombre del producto", { exact: true }).fill("Filtro nuevo");
  await page.getByLabel("Categoría", { exact: true }).selectOption("Equipos");
  await page.getByLabel("Origen", { exact: true }).selectOption("Importado");
  await page.getByLabel("Cantidad inicial que ingresa").fill("6");
  return { movements, creates: () => creates };
}
async function save(page: Page) {
  await page.getByRole("button", { name: "Revisar producto", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar producto", exact: true }).click();
}
test("crear producto registra ingreso inicial por RPC y muestra acceso a ajustes", async ({ page }) => {
  const data = await setup(page);
  await expect(page.locator("#producto-categoria option:not([disabled])")).toHaveText(["Comida", "Liquidos", "Accesorios", "Equipos", "Plantas", "Hamsters"]);
  await expect(page.locator("#producto-origen option:not([disabled])")).toHaveText(["Nacional", "Importado"]);
  await save(page);
  await expect(page).toHaveURL(/productos\/.+\/editar/);
  await expect(page.getByText("6 unidades actuales")).toBeVisible();
  await expect(page.getByRole("link", { name: "Registrar entrada o ajustar cantidad" })).toBeVisible();
  expect(data.creates()).toBe(1);
  expect(data.movements).toHaveLength(1);
  expect(data.movements[0]).toMatchObject({ p_tipo: "ENTRADA", p_cantidad: 6, p_stock_esperado: null });
});
test("creación incierta recupera la cantidad inicial al recargar", async ({ page }) => {
  const data = await setup(page, "product"); await save(page);
  await expect(page.getByRole("button", { name: "Consultar resultado" })).toBeVisible();
  await page.reload(); await page.getByRole("button", { name: "Consultar resultado" }).click();
  await expect(page).toHaveURL(/productos\/.+\/editar/);
  await expect(page.getByText("6 unidades actuales")).toBeVisible();
  expect(data.creates()).toBe(1); expect(data.movements).toHaveLength(1);
});
test("ingreso incierto recupera la misma clave sin recrear el producto", async ({ page }) => {
  const data = await setup(page, "entry"); await save(page);
  await expect(page).toHaveURL(/inventario\/.+\/movimiento/);
  await expect(page.getByText(/El producto ya fue creado/)).toBeVisible();
  await page.reload(); await page.getByRole("button", { name: "Reintentar mismo movimiento" }).click();
  await expect(page.getByText(/Movimiento recuperado sin duplicarlo/)).toBeVisible();
  expect(data.creates()).toBe(1); expect(data.movements).toHaveLength(2);
  expect(data.movements[0]).toEqual(data.movements[1]);
});
test("catálogo ordena SKU numéricamente y llena el marco de la foto", async ({ page }) => {
  await mock(page);
  const rows = [10, 2, 1].map((n, i) => ({ ...products[i], sku: `SKU-${n}`, imagen_path: "test.png" }));
  await page.route(`${api}/rest/v1/productos*`, route => route.fulfill({ json: rows }));
  await page.route(`${api}/storage/v1/**`, route => route.request().method() === "POST" ? route.fulfill({ json: [{ path: "test.png", signedURL: "/object/sign/productos-imagenes/test.png?token=test", error: null }] }) : route.fulfill({ path: "src/assets/ariza-logo.png", contentType: "image/png" }));
  await page.goto("/catalogo");
  await expect(page.locator(".product-card")).toHaveCount(3);
  const cards = page.locator(".product-card");
  await expect(cards.nth(0)).toContainText("SKU-1"); await expect(cards.nth(1)).toContainText("SKU-2"); await expect(cards.nth(2)).toContainText("SKU-10");
  await expect(cards.first().locator("img")).toHaveCSS("object-fit", "cover");
  await page.screenshot({ path: "output/frontend/catalogo-fotos-completas.png", fullPage: true });
});
