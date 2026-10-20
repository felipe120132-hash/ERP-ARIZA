import { test, expect, type Page } from "@playwright/test";
import { mock, api, id, products, now } from "./fixtures";
const saleId = "44444444-4444-4444-8444-444444444444",
  clientId = "33333333-3333-4333-8333-333333333333",
  onedriveEndpoint = `${api}/functions/v1/onedrive`;
const sale = {
  id: saleId,
  consecutivo: 2049,
  cliente_id: clientId,
  vendedor_id: id,
  tipo_pago: "CREDITO",
  aplica_iva: true,
  subtotal: 12345.67,
  iva: 2345.68,
  total: 14691.35,
  estado: "PENDIENTE",
  pdf_url: null as string | null,
  fecha: now,
  created_at: now,
};
async function setup(
  page: Page,
  { role = "ADMIN", mode = "ok", many = false, empty = false } = {},
) {
  await mock(page, { role });
  let state = "PENDIENTE",
    pdfUrl: string | null = null,
    writes = 0,
    readFail = false;
  let payload: unknown;
  await page.route(`${api}/rest/v1/clientes*`, (r) =>
    r.fulfill({
      json: {
        id: clientId,
        nombre_tienda: "Tienda Central Bogotá",
        contacto: "María Pérez",
        telefono: "3001234567",
        direccion: "Calle 15 # 20-30",
        tipo_cliente: "TIENDA",
        saldo_cartera: 12345.67,
        en_mora: false,
        activo: true,
        created_at: now,
        updated_at: now,
      },
    }),
  );
  await page.route(`${api}/rest/v1/remisiones*`, (r) =>
    r.fulfill(
      readFail
        ? { status: 500, json: { message: "Fallo de lectura" } }
        : { json: { ...sale, estado: state, pdf_url: pdfUrl } },
    ),
  );
  const lines = Array.from({ length: empty ? 0 : many ? 85 : 1 }, (_, i) => ({
    id: `66666666-6666-4666-8666-${String(i).padStart(12, "0")}`,
    remision_id: saleId,
    producto_id: products[0].id,
    cantidad: 2,
    precio_unitario: 6172.835,
    subtotal_linea: 12345.67,
    tasa_iva_aplicada: 19,
    iva_linea: 2345.68,
    created_at: now,
  }));
  await page.route(`${api}/rest/v1/detalles_remision*`, (r) =>
    r.fulfill({
      json: lines,
      headers: {
        "content-range": `0-${Math.max(0, lines.length - 1)}/${lines.length}`,
        "access-control-expose-headers": "content-range",
      },
    }),
  );
  await page.route(`${api}/rest/v1/rpc/anular_remision`, async (r) => {
    writes++;
    payload = r.request().postDataJSON();
    await new Promise((resolve) => setTimeout(resolve, 180));
    if (mode === "reject")
      return r.fulfill({
        status: 400,
        json: { code: "P0001", message: "La remisión no permite anulación" },
      });
    if (mode === "uncertain") return r.abort();
    state = "ANULADA";
    if (mode === "read-fail") readFail = true;
    return r.fulfill({ status: 204 });
  });
  await page.goto(`/remisiones/${saleId}`);
  await expect(
    page.getByRole("heading", { name: "Tienda Central Bogotá" }),
  ).toBeVisible();
  return {
    writes: () => writes,
    payload: () => payload,
    setState: (s: string) => (state = s),
    setPdfUrl: (u: string | null) => (pdfUrl = u),
    restore: () => (readFail = false),
  };
}
async function openCancel(page: Page) {
  await page
    .getByRole("button", { name: "Anular remisión", exact: true })
    .click();
  await expect(page.getByLabel("Escribe 2049 para confirmar")).toBeVisible();
}
test("anulación requiere consecutivo, envía una vez y muestra estado confirmado", async ({
  page,
}) => {
  const s = await setup(page);
  await openCancel(page);
  await expect(
    page.getByRole("button", { name: "Confirmar anulación" }),
  ).toBeDisabled();
  await page.getByLabel("Escribe 2049 para confirmar").fill("2049");
  await page.getByRole("button", { name: "Confirmar anulación" }).dblclick();
  await expect(
    page.getByRole("heading", { name: "Remisión anulada", exact: true }),
  ).toBeVisible();
  expect(s.writes()).toBe(1);
  expect(s.payload()).toEqual({ p_remision_id: saleId });
  await page.getByRole("button", { name: "Volver al detalle" }).click();
  await expect(page.locator(".receipt-heading")).toContainText("ANULADA");
  await expect(
    page.getByRole("button", { name: "Anular remisión", exact: true }),
  ).toHaveCount(0);
});
test("rechazo conserva estado y no da éxito", async ({ page }) => {
  const s = await setup(page, { mode: "reject" });
  await openCancel(page);
  await page.getByLabel("Escribe 2049 para confirmar").fill("2049");
  await page.getByRole("button", { name: "Confirmar anulación" }).click();
  await expect(page.getByRole("alert")).toContainText("no permite");
  await expect(
    page.getByRole("button", { name: "Confirmar anulación" }),
  ).toBeDisabled();
  expect(s.writes()).toBe(1);
});
test("respuesta incierta bloquea reenvío al reabrir y consulta resuelve", async ({
  page,
}) => {
  const s = await setup(page, { mode: "uncertain" });
  await openCancel(page);
  await page.getByLabel("Escribe 2049 para confirmar").fill("2049");
  await page.getByRole("button", { name: "Confirmar anulación" }).click();
  await expect(page.getByText("Hay una solicitud sin confirmar")).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Anular remisión", exact: true })
    .click();
  await expect(page.getByText("Hay una solicitud sin confirmar")).toBeVisible();
  s.setState("ANULADA");
  await page.getByRole("button", { name: "Consultar estado" }).click();
  await expect(
    page.getByRole("heading", { name: "Remisión anulada", exact: true }),
  ).toBeVisible();
  expect(s.writes()).toBe(1);
});
test("fallo de lectura tras anular solo reintenta consulta", async ({
  page,
}) => {
  const s = await setup(page, { mode: "read-fail" });
  await openCancel(page);
  await page.getByLabel("Escribe 2049 para confirmar").fill("2049");
  await page.getByRole("button", { name: "Confirmar anulación" }).click();
  await expect(page.getByText("Hay una solicitud sin confirmar")).toBeVisible();
  s.restore();
  await page.getByRole("button", { name: "Consultar estado" }).click();
  await expect(
    page.getByRole("heading", { name: "Remisión anulada", exact: true }),
  ).toBeVisible();
  expect(s.writes()).toBe(1);
});
test("vendedor descarga PDF actualizado pero no puede anular", async ({
  page,
}) => {
  const s = await setup(page, { role: "VENDEDOR" });
  await expect(
    page.getByRole("button", { name: "Anular remisión", exact: true }),
  ).toHaveCount(0);
  s.setState("ANULADA");
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar PDF" }).click();
  const file = await dl;
  expect(file.suggestedFilename()).toBe("remision-2049-anulada.pdf");
  await file.saveAs("output/pdf/remision-prueba-anulada.pdf");
  expect(s.writes()).toBe(0);
});
test("PDF multipágina y confirmación móvil", async ({ page }) => {
  const s = await setup(page, { many: true });
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar PDF" }).click();
  await (await dl).saveAs("output/pdf/remision-prueba-multipagina.pdf");
  await page.setViewportSize({ width: 390, height: 844 });
  await openCancel(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "output/frontend/anulacion-mobile.png",
    fullPage: true,
  });
  expect(s.writes()).toBe(0);
});
test("PDF sin líneas se rechaza sin modificar datos", async ({ page }) => {
  const s = await setup(page, { empty: true });
  await page.getByRole("button", { name: "Descargar PDF" }).click();
  await expect(page.getByRole("alert")).toContainText("no tiene líneas");
  expect(s.writes()).toBe(0);
});
test("impresión abre vista PDF y no registra cambios", async ({ page }) => {
  const s = await setup(page);
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Abrir PDF para imprimir" }).click();
  const p = await popup;
  await expect(p).toHaveURL(/^blob:/);
  expect(s.writes()).toBe(0);
  await p.close();
});
test("guardar PDF en OneDrive genera y sube el PDF real de la remisión sin redirigir", async ({
  page,
}) => {
  const s = await setup(page);
  let uploads = 0;
  let capturedBody: Buffer | null = null;
  await page.route(onedriveEndpoint, async (r) => {
    const contentType = r.request().headers()["content-type"] ?? "";
    if (contentType.startsWith("multipart/form-data")) {
      uploads++;
      capturedBody = r.request().postDataBuffer();
      const bodyStr = capturedBody?.toString("utf8") ?? "";
      const idMatch = bodyStr.match(/"id":"([0-9a-f-]{36})"/i);
      const docId = idMatch?.[1] ?? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      const permanentUrl = `https://onedrive.live.com/ArizaERP/${docId}.pdf`;
      s.setPdfUrl(permanentUrl);
      return r.fulfill({
        json: {
          document: {
            id: docId,
            tipo_documento: "OTRO",
            nombre: "Remisión #2049",
            onedrive_url: permanentUrl,
            cliente_id: clientId,
            remision_id: saleId,
            subido_por: id,
            created_at: now,
          },
        },
      });
    }
    return r.fulfill({ json: { ok: true } });
  });

  await page.getByRole("button", { name: "Guardar PDF en OneDrive" }).dblclick();

  await expect(page).toHaveURL(new RegExp(`/remisiones/${saleId}$`));
  await expect(
    page.getByText(
      /Documento «Remisión #2049» guardado en OneDrive para la remisión #2049\./,
    ),
  ).toBeVisible();
  await expect(page.getByText("PDF principal guardado")).toBeVisible();

  expect(uploads).toBe(1);
  expect(capturedBody).not.toBeNull();
  const rawPayload = capturedBody!.toString("latin1");
  expect(rawPayload).toContain(`"remision_id":"${saleId}"`);
  expect(rawPayload).toContain(`"cliente_id":"${clientId}"`);
  expect(rawPayload).toContain(`"pdf_remision":true`);
  expect(rawPayload).toContain("filename=\"remision-2049.pdf\"");
  expect(rawPayload).toContain("%PDF-");
});
test("guardar PDF en OneDrive conserva solicitud ante fallo de red y reconcilia sin duplicar", async ({
  page,
}) => {
  const s = await setup(page);
  let uploads = 0;
  let firstUploadId: string | null = null;
  await page.route(onedriveEndpoint, async (r) => {
    const contentType = r.request().headers()["content-type"] ?? "";
    if (contentType.startsWith("multipart/form-data")) {
      uploads++;
      const bodyStr = r.request().postDataBuffer()?.toString("utf8") ?? "";
      const idMatch = bodyStr.match(/"id":"([0-9a-f-]{36})"/i);
      firstUploadId = idMatch?.[1] ?? null;
      return r.abort();
    }
    const b = r.request().postDataJSON();
    if (b.action === "recover") {
      expect(b.id).toBe(firstUploadId);
      const permanentUrl = `https://onedrive.live.com/ArizaERP/${b.id}.pdf`;
      s.setPdfUrl(permanentUrl);
      return r.fulfill({
        json: {
          document: {
            id: b.id,
            tipo_documento: "OTRO",
            nombre: "Remisión #2049",
            onedrive_url: permanentUrl,
            cliente_id: clientId,
            remision_id: saleId,
            subido_por: id,
            created_at: now,
          },
        },
      });
    }
    return r.fulfill({ json: { ok: true } });
  });

  await page.getByRole("button", { name: "Guardar PDF en OneDrive" }).click();
  await expect(page.getByText("Subida pendiente de confirmar")).toBeVisible();
  expect(uploads).toBe(1);

  await page.getByRole("button", { name: "Consultar resultado" }).click();
  await expect(
    page.getByText(
      /Documento «Remisión #2049» guardado en OneDrive para la remisión #2049\./,
    ),
  ).toBeVisible();
  expect(uploads).toBe(1);
});
