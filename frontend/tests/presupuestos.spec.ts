import { test, expect, type Page } from "@playwright/test";
import { mock, api, now } from "./fixtures";
async function setup(
  page: Page,
  { existing = false, fail = false, denied = false, role = "ADMIN" } = {},
) {
  await mock(page, { role });
  let budget: any = existing
    ? {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        mes_referencia: "2026-10-01",
        presupuesto_limite: 100,
        created_at: now,
      }
    : null;
  const writes: any[] = [];
  await page.route(`${api}/rest/v1/gastos*`, (r) => r.fulfill({ json: [] }));
  await page.route(`${api}/rest/v1/rpc/resumen_financiero_mensual`, (r) =>
    r.fulfill({
      json: [
        {
          total_ventas: 500,
          total_gastos: 50,
          ganancia_neta: 450,
          presupuesto_limite: budget?.presupuesto_limite ?? null,
          excede_presupuesto: budget !== null && budget.presupuesto_limite < 50,
        },
      ],
    }),
  );
  await page.route(`${api}/rest/v1/presupuestos*`, (r) => {
    if (r.request().method() === "GET") return r.fulfill({ json: budget });
    const body = r.request().postDataJSON();
    writes.push({ body, url: r.request().url(), method: r.request().method() });
    if (denied)
      return r.fulfill({
        status: 403,
        json: { code: "42501", message: "Denegado" },
      });
    budget = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      mes_referencia: "2026-10-01",
      created_at: now,
      ...budget,
      ...body,
    };
    if (fail) return r.abort();
    return r.fulfill({ json: budget });
  });
  await page.goto("/finanzas?mes=2026-10");
  return writes;
}
async function open(page: Page) {
  await page
    .getByRole("button", { name: "Gestionar presupuesto", exact: true })
    .click();
  await expect(page.getByLabel("Límite mensual (COP)")).toBeVisible();
}
test("presupuesto: crear con revisión, envío único y resumen actualizado", async ({
  page,
}) => {
  const writes = await setup(page);
  await open(page);
  await page.getByLabel("Límite mensual (COP)").fill("200.25");
  await page
    .getByRole("button", { name: "Revisar presupuesto", exact: true })
    .click();
  expect(writes).toHaveLength(0);
  await page
    .getByRole("button", { name: "Confirmar presupuesto", exact: true })
    .dblclick();
  await expect(
    page.getByRole("heading", { name: "Presupuesto guardado" }),
  ).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0].body).toEqual({
    mes_referencia: "2026-10-01",
    presupuesto_limite: 200.25,
  });
  await page.getByRole("button", { name: "Volver a finanzas" }).click();
  await expect(page.getByText("Disponible para gastos")).toBeVisible();
  await expect(page.locator(".finance-budget")).toContainText("150,25");
});
test("presupuesto: editar a cero compara importe anterior y muestra exceso", async ({
  page,
}) => {
  const writes = await setup(page, { existing: true });
  await open(page);
  await expect(page.getByLabel("Límite mensual (COP)")).toHaveValue("100");
  await page.getByLabel("Límite mensual (COP)").fill("0");
  await page
    .getByRole("button", { name: "Revisar presupuesto", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmar presupuesto", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Presupuesto guardado" }),
  ).toBeVisible();
  expect(writes[0].method).toBe("PATCH");
  expect(writes[0].body).toEqual({ presupuesto_limite: 0 });
  expect(writes[0].url).toContain("presupuesto_limite=eq.100");
  await page.getByRole("button", { name: "Volver a finanzas" }).click();
  await expect(page.getByText("Exceso sobre el límite")).toBeVisible();
});
test("presupuesto: respuesta perdida se verifica después de recargar sin reenviar", async ({
  page,
}) => {
  const writes = await setup(page, { fail: true });
  await open(page);
  await page.getByLabel("Límite mensual (COP)").fill("300");
  await page
    .getByRole("button", { name: "Revisar presupuesto", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmar presupuesto", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Consultar resultado del presupuesto" }),
  ).toBeEnabled();
  await page.reload();
  await page
    .getByRole("button", { name: "Gestionar presupuesto", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Consultar resultado del presupuesto" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Presupuesto guardado" }),
  ).toBeVisible();
  expect(writes).toHaveLength(1);
});
test("presupuesto: rechazo requiere consultar nuevamente y no muestra éxito", async ({
  page,
}) => {
  await setup(page, { denied: true });
  await open(page);
  await page.getByLabel("Límite mensual (COP)").fill("300");
  await page
    .getByRole("button", { name: "Revisar presupuesto", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmar presupuesto", exact: true })
    .click();
  await expect(
    page.getByText("No tienes permisos para guardar este presupuesto."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reintentar presupuesto" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Presupuesto guardado" }),
  ).toHaveCount(0);
});
test("presupuesto: vendedor no consulta presupuestos", async ({ page }) => {
  let reads = 0;
  page.on("request", (r) => {
    if (r.url().includes("/rest/v1/presupuestos")) reads++;
  });
  await setup(page, { role: "VENDEDOR" });
  await expect(
    page.getByRole("heading", { name: "Acceso restringido" }),
  ).toBeVisible();
  expect(reads).toBe(0);
});
test("presupuesto: precisión y diseño móvil", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const writes = await setup(page, { existing: true });
  await open(page);
  await page.getByLabel("Límite mensual (COP)").fill("1.001");
  await expect(
    page.getByRole("button", { name: "Revisar presupuesto", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Límite mensual (COP)").fill("2500.50");
  await page
    .getByRole("button", { name: "Revisar presupuesto", exact: true })
    .click();
  expect(writes).toHaveLength(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "output/frontend/presupuesto-mobile.png",
    fullPage: true,
  });
});

test("presupuesto: fallo de lectura no permite crear sobre datos desconocidos", async ({
  page,
}) => {
  const writes = await setup(page);
  await page.route(`${api}/rest/v1/presupuestos*`, (r) =>
    r.fulfill({ status: 500, json: { message: "No disponible" } }),
  );
  await page
    .getByRole("button", { name: "Gestionar presupuesto", exact: true })
    .click();
  await expect(
    page.getByText("No pudimos consultar el presupuesto del mes."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Revisar presupuesto", exact: true }),
  ).toHaveCount(0);
  expect(writes).toHaveLength(0);
});
test("presupuesto: conflicto concurrente solicita actualizar", async ({
  page,
}) => {
  await setup(page, { existing: true });
  await open(page);
  await page.route(`${api}/rest/v1/presupuestos*`, (r) =>
    r.fulfill({
      status: 406,
      json: { code: "PGRST116", message: "Sin filas" },
    }),
  );
  await page.getByLabel("Límite mensual (COP)").fill("300");
  await page
    .getByRole("button", { name: "Revisar presupuesto", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmar presupuesto", exact: true })
    .click();
  await expect(
    page.getByText(
      "Otro cambio modificó el presupuesto. Actualiza los datos antes de continuar.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reintentar presupuesto" }),
  ).toBeVisible();
});
