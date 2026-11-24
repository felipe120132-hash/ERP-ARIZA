import { test, expect, type Page } from "@playwright/test";
import { mock, api, products, id, now } from "./fixtures";

const client = {
  id: "33333333-3333-4333-8333-000000000001",
  nombre_tienda: "Tienda El Sol",
  contacto: "Carlos",
  telefono: "3001234567",
  direccion: "Calle 10 #20-30",
  tipo_cliente: "TIENDA" as const,
  saldo_cartera: 0,
  en_mora: false,
  activo: true,
  created_at: now,
  updated_at: now,
};

const remision = {
  id: "44444444-4444-4444-8444-000000000001",
  consecutivo: 1050,
  cliente_id: client.id,
  vendedor_id: id,
  tipo_pago: "CONTADO" as const,
  aplica_iva: true,
  subtotal: 36000,
  iva: 6840,
  total: 42840,
  estado: "PAGADA" as const,
  pdf_url: null,
  fecha: "2026-10-15T14:00:00.000Z",
  created_at: "2026-10-15T14:00:00.000Z",
};

const detalle = {
  id: "55555555-5555-4555-8555-000000000001",
  remision_id: remision.id,
  producto_id: products[0].id,
  cantidad: 2,
  precio_unitario: 18000,
  subtotal_linea: 36000,
  tasa_iva_aplicada: 19,
  iva_linea: 6840,
  created_at: "2026-10-15T14:00:00.000Z",
};

async function setupRentabilidad(page: Page, role: "ADMIN" | "VENDEDOR" = "ADMIN") {
  await mock(page, { role });
  let costos = [
    {
      producto_id: products[0].id,
      costo_llegada: 12000,
      actualizado_por: id,
      created_at: now,
      updated_at: now,
    },
  ];
  const snapshots = [
    {
      detalle_remision_id: detalle.id,
      remision_id: remision.id,
      producto_id: products[0].id,
      costo_unitario: 12000,
      costo_linea: 24000,
      created_at: "2026-10-15T14:00:00.000Z",
    },
  ];
  const savedCalls: Array<{ p_producto_id: string; p_costo_llegada: number }> = [];

  await page.route(`${api}/rest/v1/costos_producto*`, (r) =>
    r.fulfill({ json: costos }),
  );
  await page.route(`${api}/rest/v1/clientes*`, (r) =>
    r.fulfill({ json: [client] }),
  );
  await page.route(`${api}/rest/v1/remisiones*`, (r) =>
    r.fulfill({ json: [remision] }),
  );
  await page.route(`${api}/rest/v1/detalles_remision*`, (r) =>
    r.fulfill({ json: [detalle] }),
  );
  await page.route(`${api}/rest/v1/costos_detalle_remision*`, (r) =>
    r.fulfill({ json: snapshots }),
  );
  await page.route(`${api}/rest/v1/rpc/guardar_costo_producto`, async (r) => {
    const body = r.request().postDataJSON();
    savedCalls.push(body);
    const updated = {
      producto_id: body.p_producto_id,
      costo_llegada: body.p_costo_llegada,
      actualizado_por: id,
      created_at: now,
      updated_at: new Date().toISOString(),
    };
    const idx = costos.findIndex((c) => c.producto_id === body.p_producto_id);
    if (idx >= 0) costos[idx] = updated;
    else costos = [...costos, updated];
    await r.fulfill({ json: updated });
  });

  return { savedCalls };
}

test("vendedor no ve enlace de rentabilidad ni puede acceder a la ruta", async ({
  page,
}) => {
  await setupRentabilidad(page, "VENDEDOR");
  await page.goto("/catalogo");
  await expect(
    page.locator(".desktop-sidebar").getByRole("link", { name: "Rentabilidad y costos" }),
  ).toHaveCount(0);
  await page.goto("/rentabilidad");
  await expect(
    page.getByRole("heading", { name: "Acceso restringido" }),
  ).toBeVisible();
});

test("admin consulta ganancia por producto y edita precio de llegada con vista previa", async ({
  page,
}) => {
  const { savedCalls } = await setupRentabilidad(page);
  await page.goto("/rentabilidad?mes=2026-10");

  await expect(
    page.getByRole("heading", { name: "Precios de llegada y ganancias." }),
  ).toBeVisible();
  // Café de origen llega a 12.000, tienda 18.000 -> ganancia tienda +6.000 (33,3%)
  await expect(page.locator("tbody")).toContainText("Café de origen");
  await expect(page.locator("tbody")).toContainText("6.000");

  // Definir costo de Producto 1 (precio_tienda: 18001, precio_distribuidor: 16001)
  await page
    .getByRole("button", { name: "Definir costo de Producto 1", exact: true })
    .click();
  await page.getByLabel("Precio unitario de llegada (COP)").fill("17000");
  await expect(
    page.getByText(/supera al menos uno de los precios actuales de venta/),
  ).toBeVisible();

  await page.getByLabel("Precio unitario de llegada (COP)").fill("11001");
  await page.getByRole("button", { name: "Guardar costo" }).click();

  expect(savedCalls).toEqual([
    {
      p_producto_id: products[1].id,
      p_costo_llegada: 11001,
    },
  ]);
  await expect(page.locator("tbody")).toContainText("11.001");
});

test("admin consulta ganancia por venta y desglose de productos vendidos", async ({
  page,
}) => {
  await setupRentabilidad(page);
  await page.goto("/rentabilidad?mes=2026-10&vista=ventas");

  await expect(page.locator("tbody")).toContainText("#1050");
  await expect(page.locator("tbody")).toContainText("Tienda El Sol");
  // Venta sin IVA: 36.000, Costo congelado: 24.000 -> Ganancia: 12.000
  await expect(page.locator("tbody")).toContainText("12.000");

  await page
    .getByRole("button", {
      name: "Ver desglose de ganancia de la remisión #1050",
    })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Café de origen");
  await expect(page.getByRole("dialog")).toContainText("Congelado en venta");
  await expect(page.getByRole("dialog")).toContainText("24.000");
});
