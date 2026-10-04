import { test, expect, type Page } from "@playwright/test";
import { mock, api, id, products, now } from "./fixtures";
const clientId = "33333333-3333-4333-8333-333333333333",
  saleId = "44444444-4444-4444-8444-444444444444";
const client = {
  id: clientId,
  nombre_tienda: "Tienda Central",
  contacto: null,
  telefono: null,
  direccion: null,
  tipo_cliente: "TIENDA",
  saldo_cartera: 0,
  en_mora: false,
  activo: true,
  created_at: now,
  updated_at: now,
};
const sale = {
  id: saleId,
  consecutivo: 2049,
  cliente_id: clientId,
  vendedor_id: id,
  tipo_pago: "CREDITO",
  aplica_iva: false,
  subtotal: 12345.67,
  iva: 0,
  total: 12345.67,
  estado: "PENDIENTE",
  pdf_url: null,
  fecha: now,
  created_at: now,
};
async function setup(page: Page) {
  await mock(page);
  await page.route(`${api}/rest/v1/clientes*`, (route) =>
    route.fulfill({
      json: route.request().url().includes("id=eq.") ? client : [client],
    }),
  );
  await page.route(`${api}/rest/v1/remisiones*`, (route) =>
    route.fulfill({
      json: route.request().url().includes("id=eq.")
        ? sale
        : [
            sale,
            {
              ...sale,
              id: "55555555-5555-4555-8555-555555555555",
              consecutivo: 2050,
              estado: "ANULADA",
              tipo_pago: "CONTADO",
            },
          ],
    }),
  );
  await page.route(`${api}/rest/v1/detalles_remision*`, (route) =>
    route.fulfill({
      json: [
        {
          id: "66666666-6666-4666-8666-666666666666",
          remision_id: saleId,
          producto_id: products[0].id,
          cantidad: 2,
          precio_unitario: 6172.835,
          subtotal_linea: 12345.67,
          tasa_iva_aplicada: 0,
          iva_linea: 0,
          created_at: now,
        },
      ],
    }),
  );
  await page.goto("/catalogo");
  await expect(page.getByRole("article")).toHaveCount(12);
}
async function draft(page: Page) {
  await page
    .getByRole("button", { name: "Agregar Café de origen", exact: true })
    .click();
  await page.getByLabel("Seleccionar cliente").selectOption(clientId);
}
test("subtotal: precio tienda, cantidad decimal y revisión sin IVA", async ({
  page,
}) => {
  await setup(page);
  await draft(page);
  await expect(page.getByTestId("pedido-subtotal")).toContainText("18.000,00");
  await page.getByLabel("Cantidad de Café de origen").fill("2.25");
  await expect(page.getByTestId("pedido-subtotal")).toContainText("40.500,00");
  await page.getByRole("switch", { name: "Aplicar IVA" }).click();
  await expect(page.getByTestId("pedido-subtotal")).toContainText("40.500,00");
  await page.getByRole("button", { name: "Revisar pedido" }).click();
  await expect(page.locator(".review-subtotal")).toContainText("40.500,00");
});
test("subtotal: distribuidor y acuerdo de precio cero tienen prioridad", async ({
  page,
}) => {
  await setup(page);
  await page.route(`${api}/rest/v1/clientes*`, (route) =>
    route.fulfill({ json: [{ ...client, tipo_cliente: "DISTRIBUIDOR" }] }),
  );
  await page.reload();
  await draft(page);
  await expect(page.getByTestId("pedido-subtotal")).toContainText("16.000,00");
  await page.route(`${api}/rest/v1/precios_cliente*`, (route) =>
    route.fulfill({
      headers: {
        "content-range": "0-0/1",
        "access-control-expose-headers": "content-range",
      },
      json: [
        {
          id: saleId,
          cliente_id: clientId,
          producto_id: products[0].id,
          precio_especial: 0,
          created_at: now,
          updated_at: now,
        },
      ],
    }),
  );
  await page
    .getByRole("button", { name: "Actualizar precios del pedido" })
    .click();
  await expect(page.getByTestId("pedido-subtotal")).toHaveText(/\$\s*0,00/);
  await expect(
    page.getByRole("button", { name: "Revisar pedido" }),
  ).toBeEnabled();
});
test("subtotal: error de precios bloquea confirmación y permite reintentar", async ({
  page,
}) => {
  await setup(page);
  await page.route(`${api}/rest/v1/precios_cliente*`, (route) =>
    route.fulfill({ status: 500, json: { message: "Error de prueba" } }),
  );
  await draft(page);
  await expect(page.getByTestId("pedido-subtotal")).toHaveText("—");
  await expect(
    page.getByText("No pudimos consultar los precios de este cliente."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Revisar pedido" }),
  ).toBeDisabled();
  await page.route(`${api}/rest/v1/precios_cliente*`, (route) =>
    route.fulfill({
      headers: {
        "content-range": "0-0/1",
        "access-control-expose-headers": "content-range",
      },
      json: [
        {
          id: saleId,
          cliente_id: clientId,
          producto_id: products[0].id,
          precio_especial: 123.45,
          created_at: now,
          updated_at: now,
        },
      ],
    }),
  );
  await page
    .getByRole("button", { name: "Actualizar precios del pedido" })
    .click();
  await expect(page.getByTestId("pedido-subtotal")).toContainText("123,45");
  await page.getByLabel("Cantidad de Café de origen").fill("1.5");
  await expect(page.getByTestId("pedido-subtotal")).toContainText("185,18");
});
test("pedido: payload exacto, doble clic, total del servidor y borrado del carrito", async ({
  page,
}) => {
  await setup(page);
  let count = 0;
  let payload: unknown;
  await page.route(`${api}/rest/v1/rpc/crear_remision`, async (route) => {
    count++;
    payload = route.request().postDataJSON();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({ json: saleId });
  });
  await draft(page);
  await page.getByLabel("Cantidad de Café de origen").fill("2");
  await page
    .getByLabel("Forma de pago", { exact: true })
    .selectOption("CREDITO");
  await page.getByRole("switch", { name: "Aplicar IVA" }).click();
  await page.getByRole("button", { name: "Revisar pedido" }).click();
  await page.screenshot({
    path: "output/frontend/pedido-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Confirmar venta", exact: true })
    .dblclick();
  await expect(
    page.getByRole("heading", { name: "Remisión #2049" }),
  ).toBeVisible();
  expect(count).toBe(1);
  expect(payload).toEqual({
    p_cliente_id: clientId,
    p_tipo_pago: "CREDITO",
    p_aplica_iva: false,
    p_items: [{ producto_id: products[0].id, cantidad: 2 }],
  });
  await expect(page.locator(".receipt-totals")).toContainText("12.345,67");
  await page.screenshot({
    path: "output/frontend/remision-detalle.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Ir al catálogo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Revisar pedido" }),
  ).toBeDisabled();
  await expect(page.getByLabel("Pedido en curso")).toContainText(
    "Remisión creada",
  );
});
test("validación cantidades, cliente requerido y quitar líneas", async ({
  page,
}) => {
  await setup(page);
  await page
    .getByRole("button", { name: "Agregar Café de origen", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Revisar pedido" }),
  ).toBeDisabled();
  await page.getByLabel("Seleccionar cliente").selectOption(clientId);
  for (const value of ["0", "-1", "11", "1.001"]) {
    await page.getByLabel("Cantidad de Café de origen").fill(value);
    await expect(
      page.getByRole("button", { name: "Revisar pedido" }),
    ).toBeDisabled();
  }
  await page.getByLabel("Cantidad de Café de origen").fill("1.5");
  await expect(
    page.getByRole("button", { name: "Revisar pedido" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Quitar Café de origen" }).click();
  await expect(
    page.getByRole("button", { name: "Revisar pedido" }),
  ).toBeDisabled();
});
test("rechazo de stock conserva borrador y permite corrección", async ({
  page,
}) => {
  await setup(page);
  await page.route(`${api}/rest/v1/rpc/crear_remision`, (route) =>
    route.fulfill({
      status: 400,
      json: { code: "P0001", message: "Stock insuficiente para el producto" },
    }),
  );
  await draft(page);
  await page.getByRole("button", { name: "Revisar pedido" }).click();
  await page
    .getByRole("button", { name: "Confirmar venta", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Stock insuficiente");
  await expect(page.getByLabel("Cantidad de Café de origen")).toHaveValue("1");
  await expect(
    page.getByRole("button", { name: "Revisar pedido" }),
  ).toBeEnabled();
});
test("fallo de lectura tras crear no reenvía la venta", async ({ page }) => {
  await setup(page);
  let count = 0;
  await page.route(`${api}/rest/v1/rpc/crear_remision`, (route) => {
    count++;
    return route.fulfill({ json: saleId });
  });
  await page.route(`${api}/rest/v1/detalles_remision*`, (route) =>
    route.fulfill({ status: 500, json: { message: "Lectura no disponible" } }),
  );
  await draft(page);
  await page.getByRole("button", { name: "Revisar pedido" }).click();
  await page
    .getByRole("button", { name: "Confirmar venta", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reintentar lectura" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reintentar lectura" }).click();
  await expect(
    page.getByRole("button", { name: "Reintentar lectura" }),
  ).toBeVisible();
  expect(count).toBe(1);
});
test("conexión incierta bloquea reenvío y ofrece historial", async ({
  page,
}) => {
  await setup(page);
  await page.route(`${api}/rest/v1/rpc/crear_remision`, (route) =>
    route.abort(),
  );
  await draft(page);
  await page.getByRole("button", { name: "Revisar pedido" }).click();
  await page
    .getByRole("button", { name: "Confirmar venta", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Revisar historial" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirmar venta", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Cantidad de Café de origen")).toBeDisabled();
});
test("historial: filtros y apertura del detalle", async ({ page }) => {
  await setup(page);
  await page.goto("/remisiones");
  await expect(page.getByRole("row")).toHaveCount(3);
  await page.getByLabel("Estado de remisión").selectOption("PENDIENTE");
  await expect(page.getByRole("row")).toHaveCount(2);
  await page.getByRole("link", { name: "Ver remisión 2049" }).click();
  await expect(
    page.getByRole("heading", { name: "Remisión #2049" }),
  ).toBeVisible();
});
test("carrito móvil sin desbordes y borrador conservado al navegar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await draft(page);
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Remisiones", exact: true })
    .click();
  await page.getByRole("link", { name: "Nuevo pedido" }).click();
  await expect(page.getByLabel("Cantidad de Café de origen")).toHaveValue("1");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByLabel("Pedido en curso")
    .screenshot({ path: "output/frontend/pedido-mobile.png" });
});
