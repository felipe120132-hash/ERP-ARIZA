import { test, expect, type Page } from "@playwright/test";
import { mock, api, id, now, products } from "./fixtures";
const customer = {
  id: "77777777-7777-4777-8777-777777777777",
  nombre_tienda: "Mercado San José",
  saldo_cartera: 150000.25,
  en_mora: true,
};
const sale = {
  id: "88888888-8888-4888-8888-888888888888",
  consecutivo: 1018,
  cliente_id: customer.id,
  vendedor_id: id,
  tipo_pago: "CONTADO",
  aplica_iva: true,
  subtotal: 10000,
  iva: 1900,
  total: 11900,
  estado: "PENDIENTE",
  pdf_url: null,
  fecha: now,
  created_at: now,
};
const headers = (total: number) => ({
  "content-range": `0-4/${total}`,
  "access-control-expose-headers": "content-range",
});
async function setup(
  page: Page,
  { role = "ADMIN", fail = false, empty = false } = {},
) {
  await mock(page, { role });
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/rest/v1/")) calls.push(r.method() + " " + r.url());
  });
  await page.route(`${api}/rest/v1/clientes*`, (r) =>
    r.fulfill(
      fail
        ? { status: 500, json: { message: "Sin acceso" } }
        : { json: empty ? [] : [customer], headers: headers(empty ? 0 : 1) },
    ),
  );
  await page.route(`${api}/rest/v1/remisiones*`, (r) =>
    r.fulfill({
      json: r.request().method() === "HEAD" ? undefined : empty ? [] : [sale],
      headers: headers(empty ? 0 : 17),
    }),
  );
  await page.route(`${api}/rest/v1/vista_alertas_stock*`, (r) =>
    r.fulfill({
      json: empty ? [] : [{ ...products[0], semaforo: "ROJO" }],
      headers: headers(empty ? 0 : 8),
    }),
  );
  await page.route(`${api}/rest/v1/rpc/resumen_financiero_mensual`, (r) =>
    r.fulfill({
      json: [
        {
          total_ventas: 543210.75,
          total_gastos: 0,
          ganancia_neta: 543210.75,
          presupuesto_limite: null,
          excede_presupuesto: false,
        },
      ],
    }),
  );
  return calls;
}
test("resumen reúne conteos del servidor, cartera y accesos sin mutaciones", async ({
  page,
}) => {
  const calls = await setup(page);
  await page.goto("/resumen");
  await expect(
    page.getByRole("link", { name: /Cartera pendiente actual/ }),
  ).toContainText("150.000,25");
  await expect(
    page.getByRole("link", { name: /Remisiones pendientes/ }),
  ).toContainText("17");
  await expect(
    page.getByRole("link", { name: /Referencias con alerta/ }),
  ).toContainText("8");
  await expect(
    page.getByRole("link", { name: /Ventas del mes/ }),
  ).toContainText("543.210,75");
  await expect(page.getByRole("link", { name: "#1018" })).toHaveAttribute(
    "href",
    `/remisiones/${sale.id}`,
  );
  await expect(
    page.getByRole("link", { name: /Mercado San José/ }),
  ).toHaveAttribute("href", `/cartera/${customer.id}`);
  expect(
    calls.filter(
      (x) =>
        x.startsWith("POST") && !x.includes("/rpc/resumen_financiero_mensual"),
    ),
  ).toEqual([]);
  await page.screenshot({
    path: "output/frontend/resumen-desktop.png",
    fullPage: true,
  });
});
test("vendedor ve operación sin consulta financiera", async ({ page }) => {
  const calls = await setup(page, { role: "VENDEDOR" });
  await page.goto("/resumen");
  await expect(page.getByRole("link", { name: "#1018" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Ventas del mes/ })).toHaveCount(
    0,
  );
  expect(calls.some((x) => x.includes("resumen_financiero"))).toBe(false);
});
test("fallo parcial no oculta remisiones ni inventa saldo cero", async ({
  page,
}) => {
  await setup(page, { fail: true });
  await page.goto("/resumen");
  await expect(page.getByRole("alert")).toContainText("cartera completa");
  await expect(
    page.getByRole("link", { name: /Cartera pendiente actual/ }),
  ).toContainText("—");
  await expect(page.getByRole("link", { name: "#1018" })).toBeVisible();
  await page.route(`${api}/rest/v1/clientes*`, (r) =>
    r.fulfill({ json: [customer], headers: headers(1) }),
  );
  await page.getByRole("button", { name: "Reintentar consulta" }).click();
  await expect(
    page.getByRole("link", { name: /Cartera pendiente actual/ }),
  ).toContainText("150.000,25");
});
test("cartera recorre páginas cuando el servidor limita la respuesta", async ({
  page,
}) => {
  await setup(page);
  let offsets: number[] = [];
  await page.route(`${api}/rest/v1/clientes*`, (r) => {
    const offset = Number(
      new URL(r.request().url()).searchParams.get("offset") || 0,
    );
    offsets.push(offset);
    return r.fulfill({
      json: [
        offset === 0
          ? customer
          : {
              ...customer,
              id: "99999999-9999-4999-8999-999999999999",
              saldo_cartera: 200.5,
            },
      ],
      headers: headers(2),
    });
  });
  await page.goto("/resumen");
  await expect(
    page.getByRole("link", { name: /Cartera pendiente actual/ }),
  ).toContainText("150.200,75");
  expect(offsets).toContain(1);
});
test("sin registros muestra estados vacíos y móvil sin desborde", async ({
  page,
}) => {
  await setup(page, { empty: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/resumen");
  await expect(
    page.getByText("Aún no hay remisiones registradas."),
  ).toBeVisible();
  await expect(
    page.getByText("No hay clientes con saldo pendiente."),
  ).toBeVisible();
  await expect(
    page.getByText("No hay alertas de stock registradas."),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "output/frontend/resumen-mobile.png",
    fullPage: true,
  });
});
