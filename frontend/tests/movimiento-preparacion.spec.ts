import { test, expect, type Page } from "@playwright/test";
import { mock, api, products } from "./fixtures";
async function setup(page: Page, role = "ADMIN") {
  await mock(page, { role });
  const writes: string[] = [];
  page.on("request", (r) => {
    if (r.url().startsWith(api) && !["GET", "OPTIONS"].includes(r.method()))
      writes.push(r.url());
  });
  await page.route(`${api}/rest/v1/productos*`, (r) =>
    r.fulfill({ json: products[0] }),
  );
  await page.goto(`/inventario/${products[0].id}/movimiento`);
  return writes;
}
test("preparación: entrada decimal y revisión no ejecutan escrituras", async ({
  page,
}) => {
  const writes = await setup(page);
  await page.getByLabel("Unidades recibidas").fill("2.25");
  await page.getByLabel("Motivo u observación").fill("Recepción del proveedor");
  await page.getByRole("button", { name: "Revisar movimiento" }).click();
  await expect(page.getByTestId("stock-previsto")).toHaveText("12,25");
  await expect(
    page.getByRole("button", { name: "Confirmar y registrar" }),
  ).toBeEnabled();
  expect(writes).toEqual([]);
  await page.screenshot({
    path: "output/frontend/movimiento-preparacion-desktop.png",
    fullPage: true,
  });
});
test("preparación: conteo a cero, mismo stock y edición de revisión", async ({
  page,
}) => {
  const writes = await setup(page);
  await page.getByLabel("Tipo de movimiento").selectOption("AJUSTE");
  await page.getByLabel("Existencias contadas").fill("0");
  await page
    .getByLabel("Motivo u observación")
    .fill("Pérdida por daño del producto");
  await page.getByRole("button", { name: "Revisar movimiento" }).click();
  await expect(page.getByTestId("stock-previsto")).toHaveText("0");
  await expect(page.getByText("Unidades a descontar")).toBeVisible();
  await page.getByLabel("Existencias contadas").fill("10");
  await expect(page.getByTestId("stock-previsto")).toHaveCount(0);
  await page.getByRole("button", { name: "Revisar movimiento" }).click();
  await expect(
    page.getByText(
      "El conteo coincide con las existencias; no hace falta un ajuste.",
    ),
  ).toBeVisible();
  expect(writes).toEqual([]);
});
test("preparación: vendedor sin consultas y producto inválido", async ({
  page,
}) => {
  let reads = 0;
  page.on("request", (r) => {
    if (r.url().includes("/rest/v1/productos")) reads++;
  });
  await setup(page, "VENDEDOR");
  await expect(
    page.getByRole("heading", { name: "Acceso restringido" }),
  ).toBeVisible();
  expect(reads).toBe(0);
});
test("preparación: móvil, motivo vacío y precisión", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const writes = await setup(page);
  await page.getByLabel("Unidades recibidas").fill("1.001");
  await page.getByRole("button", { name: "Revisar movimiento" }).click();
  await expect(page.getByTestId("stock-previsto")).toHaveCount(0);
  await page.getByLabel("Unidades recibidas").fill("1");
  await page.getByLabel("Motivo u observación").fill("     ");
  await page.getByRole("button", { name: "Revisar movimiento" }).click();
  await expect(
    page.getByText("Describe el motivo con entre 5 y 500 caracteres."),
  ).toBeVisible();
  await page.getByLabel("Motivo u observación").fill("Ingreso de mercancía");
  await page.getByRole("button", { name: "Revisar movimiento" }).click();
  await expect(page.getByTestId("stock-previsto")).toHaveText("11");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(writes).toEqual([]);
  await page.screenshot({
    path: "output/frontend/movimiento-preparacion-mobile.png",
    fullPage: true,
  });
});
