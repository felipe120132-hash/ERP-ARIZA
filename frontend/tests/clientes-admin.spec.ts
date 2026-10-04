import { test, expect, type Page } from "@playwright/test";
import { mock, api, products, now } from "./fixtures";
const cid = "77777777-7777-4777-8777-777777777777";
const customer = {
  id: cid,
  nombre_tienda: "Mercado San José",
  contacto: "Laura Pérez",
  telefono: "3001234567",
  direccion: "Calle 10",
  tipo_cliente: "TIENDA",
  saldo_cartera: 150000.5,
  en_mora: true,
  activo: true,
  created_at: now,
  updated_at: now,
};
const price = {
  id: "88888888-8888-4888-8888-888888888888",
  cliente_id: cid,
  producto_id: products[0].id,
  precio_especial: 12000,
  created_at: now,
  updated_at: now,
};
async function setup(
  page: Page,
  { role = "ADMIN", fail = false, denied = false } = {},
) {
  await mock(page, { role });
  let client = { ...customer };
  let prices: any[] = [price];
  const writes: { method: string; body: any; url: string }[] = [];
  await page.route(`${api}/rest/v1/clientes*`, async (r) => {
    const req = r.request();
    if (req.method() !== "GET") {
      writes.push({
        method: req.method(),
        body: req.postDataJSON(),
        url: req.url(),
      });
      if (fail) return r.abort();
      client = { ...client, ...req.postDataJSON() };
      return r.fulfill({ json: client });
    }
    return r.fulfill({
      json: req.url().includes("id=eq.") ? client : [client],
    });
  });
  await page.route(`${api}/rest/v1/precios_cliente*`, async (r) => {
    const req = r.request();
    if (req.method() === "GET")
      return r.fulfill({
        json: prices,
        headers: {
          "content-range": `0-0/${prices.length}`,
          "access-control-expose-headers": "content-range",
        },
      });
    writes.push({
      method: req.method(),
      body: req.postData() ? req.postDataJSON() : null,
      url: req.url(),
    });
    if (denied)
      return r.fulfill({
        status: 403,
        json: { code: "42501", message: "Permisos insuficientes" },
      });
    if (req.method() === "DELETE") {
      prices = [];
      return r.fulfill({ json: [{ id: price.id }] });
    }
    const p = { ...price, ...req.postDataJSON() };
    prices = [p];
    return r.fulfill({ json: p });
  });
  await page.route(`${api}/rest/v1/remisiones*`, (r) =>
    r.fulfill({ json: [] }),
  );
  await page.route(`${api}/rest/v1/abonos_cartera*`, (r) =>
    r.fulfill({ json: [] }),
  );
  return writes;
}
test("crear cliente exige nombre, revisa y envía solo campos comerciales", async ({
  page,
}) => {
  const writes = await setup(page);
  await page.goto("/cartera/nuevo");
  await expect(
    page.getByRole("button", { name: "Revisar cliente" }),
  ).toBeDisabled();
  await page.getByLabel("Nombre de la tienda").fill("Tienda Nueva");
  await page.getByLabel("Tipo de cliente").selectOption("DISTRIBUIDOR");
  await page.getByRole("button", { name: "Revisar cliente" }).click();
  expect(writes).toHaveLength(0);
  await page.getByRole("button", { name: "Confirmar cliente" }).dblclick();
  await expect(
    page.getByRole("heading", { name: "Tienda Nueva", exact: true }),
  ).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0].body).toMatchObject({
    nombre_tienda: "Tienda Nueva",
    tipo_cliente: "DISTRIBUIDOR",
    activo: true,
  });
  expect(writes[0].body).not.toHaveProperty("saldo_cartera");
  expect(writes[0].body).not.toHaveProperty("en_mora");
});
test("editar y desactivar conserva saldo e historial", async ({ page }) => {
  const writes = await setup(page);
  await page.goto(`/cartera/${cid}/administrar`);
  await expect(page.getByLabel("Nombre de la tienda")).toHaveValue(
    "Mercado San José",
  );
  await page.getByLabel("Cliente activo", { exact: true }).uncheck();
  await page.getByLabel("Teléfono", { exact: true }).fill("3009999999");
  await page.getByRole("button", { name: "Revisar cliente" }).click();
  await expect(
    page.getByText("El cliente dejará de aparecer", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirmar cliente" }).click();
  await expect(page).toHaveURL(`/cartera/${cid}`);
  expect(writes[0].method).toBe("PATCH");
  expect(writes[0].body.activo).toBe(false);
  expect(writes[0].body).not.toHaveProperty("saldo_cartera");
  await expect(page.getByText(/150.000,50/).first()).toBeVisible();
});
test("precio especial cero válido, edición y eliminación confirmadas", async ({
  page,
}) => {
  const writes = await setup(page);
  await page.goto(`/cartera/${cid}/administrar`);
  await expect(
    page.getByRole("button", { name: "Editar precio" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Editar precio" }).click();
  await page.getByLabel("Precio especial (COP)", { exact: true }).fill("1.123");
  await expect(
    page.getByRole("button", { name: "Revisar precio" }),
  ).toBeDisabled();
  await page.getByLabel("Precio especial (COP)", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Revisar precio" }).click();
  await page
    .getByRole("button", { name: "Confirmar cambio de precio" })
    .dblclick();
  await expect(page.locator(".order-success")).toContainText(
    "Precio actualizado",
  );
  expect(writes).toHaveLength(1);
  expect(writes[0].body).toEqual({ precio_especial: 0 });
  await page.getByRole("button", { name: "Editar precio" }).click();
  await page.getByRole("button", { name: "Quitar precio especial" }).click();
  expect(writes).toHaveLength(1);
  await expect(
    page.getByText("Volver al precio base", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirmar cambio de precio" })
    .click();
  await expect(
    page.getByText("No hay acuerdos especiales.", { exact: false }),
  ).toBeVisible();
  expect(writes[1].method).toBe("DELETE");
});
test("nuevo precio registra cliente y producto correctos", async ({ page }) => {
  const writes = await setup(page);
  await page.goto(`/cartera/${cid}/administrar`);
  await page.getByLabel("Producto del acuerdo").selectOption(products[1].id);
  await page
    .getByLabel("Precio especial (COP)", { exact: true })
    .fill("999.50");
  await page.getByRole("button", { name: "Revisar precio" }).click();
  await page
    .getByRole("button", { name: "Confirmar cambio de precio" })
    .click();
  await expect(page.locator(".order-success")).toContainText(
    "Precio actualizado",
  );
  expect(writes[0].method).toBe("POST");
  expect(writes[0].body).toEqual({
    cliente_id: cid,
    producto_id: products[1].id,
    precio_especial: 999.5,
  });
});
test("guardado incierto permanece bloqueado al recargar", async ({ page }) => {
  const writes = await setup(page, { fail: true });
  await page.goto("/cartera/nuevo");
  await page.getByLabel("Nombre de la tienda").fill("Tienda Prueba");
  await page.getByRole("button", { name: "Revisar cliente" }).click();
  await page.getByRole("button", { name: "Confirmar cliente" }).click();
  await expect(page.getByRole("alert")).toContainText("Verifica el resultado");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Habilitar otro intento" }),
  ).toBeDisabled();
  expect(writes).toHaveLength(1);
});
test("vendedor no accede al formulario ni consulta precios", async ({
  page,
}) => {
  await setup(page, { role: "VENDEDOR" });
  let calls = 0;
  page.on("request", (r) => {
    if (r.url().includes("/rest/v1/precios_cliente")) calls++;
  });
  await page.goto(`/cartera/${cid}/administrar`);
  await expect(
    page.getByRole("heading", { name: "Acceso restringido" }),
  ).toBeVisible();
  expect(calls).toBe(0);
  await page.goto("/cartera");
  await expect(page.getByRole("link", { name: "Crear cliente" })).toHaveCount(
    0,
  );
});
test("permisos rechazados no muestran precio guardado", async ({ page }) => {
  await setup(page, { denied: true });
  await page.goto(`/cartera/${cid}/administrar`);
  await page.getByRole("button", { name: "Editar precio" }).click();
  await page.getByLabel("Precio especial (COP)", { exact: true }).fill("15000");
  await page.getByRole("button", { name: "Revisar precio" }).click();
  await page
    .getByRole("button", { name: "Confirmar cambio de precio" })
    .click();
  await expect(
    page.getByText("Comprueba el precio antes de reintentar"),
  ).toBeVisible();
  await expect(
    page.getByText("Permisos insuficientes", { exact: true }),
  ).toBeVisible();
});
test("administración adaptable a escritorio y móvil", async ({ page }) => {
  await setup(page);
  await page.goto(`/cartera/${cid}/administrar`);
  await expect(
    page.getByRole("button", { name: "Editar precio" }),
  ).toBeVisible();
  await page.screenshot({
    path: "output/frontend/clientes-admin-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "output/frontend/clientes-admin-mobile.png",
    fullPage: true,
  });
});
