import { test, expect, type Page } from "@playwright/test";
import { mock, api, products } from "./fixtures";
const endpoint = `${api}/rest/v1/rpc/registrar_movimiento_inventario`;
const url = `/inventario/${products[0].id}/movimiento`;
async function setup(page: Page) {
  await mock(page);
  await page.route(`${api}/rest/v1/productos*`, route => route.fulfill({ json: products[0] }));
  await page.goto(url);
}
async function review(page: Page, tipo = "ENTRADA", cantidad = "2") {
  await page.getByLabel("Tipo de movimiento").selectOption(tipo);
  const label =
    tipo === "ENTRADA"
      ? "Unidades recibidas"
      : tipo === "SALIDA"
        ? "Unidades a retirar"
        : "Existencias contadas";
  await page.getByLabel(label).fill(cantidad);
  await page.getByLabel("Motivo u observación").fill("Prueba de inventario");
  await page.getByRole("button", { name: "Revisar movimiento" }).click();
}
function result(input: Record<string, unknown>, repetido = false) {
  const cantidad = Number(input.p_cantidad);
  const stockAnterior = 10;
  const stockResultante =
    input.p_tipo === "ENTRADA"
      ? stockAnterior + cantidad
      : input.p_tipo === "SALIDA"
        ? stockAnterior - cantidad
        : cantidad;
  const cantidadKardex =
    input.p_tipo === "AJUSTE" ? cantidad - stockAnterior : cantidad;
  return {
    kardex_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    producto_id: String(input.p_producto_id ?? products[0].id),
    tipo_movimiento: input.p_tipo,
    cantidad: cantidadKardex,
    stock_anterior: stockAnterior,
    stock_resultante: stockResultante,
    repetido,
  };
}
test("registra entrada una vez, refresca y crea una clave nueva tras éxito", async ({ page }) => {
  await setup(page); const requests: Record<string, unknown>[] = [];
  await page.route(endpoint, async route => { const body = route.request().postDataJSON(); requests.push(body); await route.fulfill({ json: result(body) }); });
  await review(page);
  await page.getByRole("button", { name: "Confirmar y registrar" }).click();
  await expect(page.getByText(/Movimiento registrado. Stock resultante/)).toBeVisible();
  expect(requests[0]).toMatchObject({ p_tipo: "ENTRADA", p_cantidad: 2, p_stock_esperado: null });
  await review(page);
  await page.getByRole("button", { name: "Confirmar y registrar" }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[0].p_idempotency_key).not.toBe(requests[1].p_idempotency_key);
});
test("ajuste envía conteo absoluto y stock esperado, permite cero", async ({ page }) => {
  await setup(page);
  await page.route(endpoint, async route => { const body = route.request().postDataJSON(); expect(body).toMatchObject({ p_tipo: "AJUSTE", p_cantidad: 0, p_stock_esperado: 10 }); await route.fulfill({ json: result(body) }); });
  await review(page, "AJUSTE", "0"); await page.getByRole("button", { name: "Confirmar y registrar" }).click();
  await expect(page.getByText(/Stock resultante del movimiento: 0 unidades/)).toBeVisible();
});
test("salida valida stock disponible, registra descuento y verifica coherencia con kardex", async ({ page }) => {
  const seededId = "00000000-0000-0000-0000-000000000001";
  let currentStock = 10;
  const kardexHistory: any[] = [];
  await mock(page);
  await page.route(`${api}/rest/v1/productos*`, route =>
    route.fulfill({ json: { ...products[0], id: seededId, stock_actual: currentStock } })
  );
  await page.route(endpoint, async route => {
    const body = route.request().postDataJSON();
    const prev = currentStock;
    currentStock =
      body.p_tipo === "ENTRADA"
        ? prev + body.p_cantidad
        : body.p_tipo === "SALIDA"
          ? prev - body.p_cantidad
          : body.p_cantidad;
    const cantKardex = body.p_tipo === "AJUSTE" ? body.p_cantidad - prev : body.p_cantidad;
    const item = {
      id: `00000000-0000-0000-0000-00000000000${kardexHistory.length + 2}`,
      producto_id: seededId,
      remision_id: null,
      tipo_movimiento: body.p_tipo,
      cantidad: cantKardex,
      stock_resultante: currentStock,
      observacion: body.p_motivo,
      created_at: new Date().toISOString(),
    };
    kardexHistory.unshift(item);
    await route.fulfill({
      json: {
        kardex_id: item.id,
        producto_id: seededId,
        tipo_movimiento: body.p_tipo,
        cantidad: cantKardex,
        stock_anterior: prev,
        stock_resultante: currentStock,
        repetido: false,
      },
    });
  });
  await page.route(`${api}/rest/v1/kardex*`, route =>
    route.fulfill({
      json: kardexHistory,
      headers: {
        "access-control-expose-headers": "content-range",
        "content-range": `0-${Math.max(0, kardexHistory.length - 1)}/${kardexHistory.length}`,
      },
    })
  );

  await page.goto(`/inventario/${seededId}/movimiento`);
  // 1. Entrada (+5 -> 15)
  await review(page, "ENTRADA", "5");
  await page.getByRole("button", { name: "Confirmar y registrar" }).click();
  await expect(page.getByText(/Stock resultante del movimiento: 15 unidades/)).toBeVisible();

  // 2. Salida (-3 -> 12)
  await review(page, "SALIDA", "3");
  await page.getByRole("button", { name: "Confirmar y registrar" }).click();
  await expect(page.getByText(/Stock resultante del movimiento: 12 unidades/)).toBeVisible();

  // 3. Ajuste (conteo físico a 9 -> diferencia -3, stock 9)
  await review(page, "AJUSTE", "9");
  await page.getByRole("button", { name: "Confirmar y registrar" }).click();
  await expect(page.getByText(/Stock resultante del movimiento: 9 unidades/)).toBeVisible();

  // 4. Verificar Kardex y existencias coinciden (9 unidades)
  await page.getByRole("link", { name: "Volver al kardex" }).click();
  await expect(page.locator(".inventory-product-summary")).toContainText("9");
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await expect(page.locator("tbody tr").nth(0)).toContainText("Ajuste");
  await expect(page.locator("tbody tr").nth(0)).toContainText("9");
  await expect(page.locator("tbody tr").nth(1)).toContainText("Salida");
  await expect(page.locator("tbody tr").nth(1)).toContainText("12");
  await expect(page.locator("tbody tr").nth(2)).toContainText("Entrada");
  await expect(page.locator("tbody tr").nth(2)).toContainText("15");
});
test("respuesta perdida conserva payload al recargar y recupera sin duplicar", async ({ page }) => {
  await setup(page); const requests: Record<string, unknown>[] = [];
  await page.route(endpoint, async route => { const body = route.request().postDataJSON(); requests.push(body); if (requests.length === 1) await route.abort(); else await route.fulfill({ json: result(body, true) }); });
  await review(page); await page.getByRole("button", { name: "Confirmar y registrar" }).click();
  await expect(page.getByRole("alert")).toContainText("No pudimos confirmar");
  await expect(page.getByLabel("Unidades recibidas")).toBeDisabled();
  await page.reload(); await page.getByRole("button", { name: "Reintentar mismo movimiento" }).click();
  await expect(page.getByText(/Movimiento recuperado sin duplicarlo/)).toBeVisible();
  expect(requests).toHaveLength(2); expect(requests[0]).toEqual(requests[1]);
});
test("stock concurrente obliga a recontar y volver a revisar", async ({ page }) => {
  await setup(page);
  await page.route(endpoint, route => route.fulfill({ status: 400, json: { code: "P0001", message: "El stock cambió desde que lo consultaste (ahora: 12). Recuenta y vuelve a enviar." } }));
  await review(page, "AJUSTE", "8"); await page.getByRole("button", { name: "Confirmar y registrar" }).click();
  await expect(page.getByRole("alert")).toContainText("Recuenta");
  await expect(page.getByLabel("Existencias contadas")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Confirmar y registrar" })).toHaveCount(0);
});
test("respuesta malformada mantiene la solicitud bloqueada", async ({ page }) => {
  await setup(page);
  await page.route(endpoint, route => route.fulfill({ json: { repetido: false } }));
  await review(page); await page.getByRole("button", { name: "Confirmar y registrar" }).click();
  await expect(page.getByRole("alert")).toContainText("La respuesta no permite confirmar");
  await expect(page.getByLabel("Motivo u observación")).toBeDisabled();
});
test("rechazo de administrador inactivo no muestra éxito", async ({ page }) => {
  await setup(page);
  await page.route(endpoint, route => route.fulfill({ status: 400, json: { code: "P0001", message: "Solo administradores activos pueden registrar movimientos de inventario." } }));
  await review(page); await page.getByRole("button", { name: "Confirmar y registrar" }).click();
  await expect(page.getByRole("alert")).toContainText("Solo administradores activos");
  await expect(page.getByRole("button", { name: "Reintentar mismo movimiento" })).toHaveCount(0);
});
