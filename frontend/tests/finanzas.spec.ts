import { test, expect, type Page } from "@playwright/test";
import { mock, api, id, now } from "./fixtures";
const expense = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  concepto: "Transporte Bogotá",
  categoria: "Logística",
  monto: 50000.25,
  mes_referencia: "2026-10-01",
  recurrente: false,
  registrado_por: id,
  created_at: now,
};
async function setup(
  page: Page,
  { failure = false, uncertain = false, role = "ADMIN" } = {},
) {
  await mock(page, { role });
  let writes = 0;
  let body: any;
  let rows = [expense];
  await page.route(`${api}/rest/v1/rpc/resumen_financiero_mensual`, (r) =>
    r.fulfill(
      failure
        ? { status: 500, json: { message: "Resumen no disponible" } }
        : {
            json: [
              {
                total_ventas: 100000.5,
                total_gastos: 50000.25,
                ganancia_neta: 32123.75,
                presupuesto_limite: 40000,
                excede_presupuesto: true,
              },
            ],
          },
    ),
  );
  await page.route(`${api}/rest/v1/gastos*`, async (r) => {
    if (r.request().method() === "POST") {
      writes++;
      body = r.request().postDataJSON();
      if (uncertain) return r.abort();
      const created = { ...expense, ...body };
      rows = [created];
      await new Promise((resolve) => setTimeout(resolve, 150));
      return r.fulfill({ json: created });
    }
    expect(
      new URL(r.request().url()).searchParams.get("mes_referencia"),
    ).toMatch(/^eq.\d{4}-\d{2}-01$/);
    return r.fulfill({ json: rows });
  });
  return { writes: () => writes, body: () => body };
}
async function fill(page: Page) {
  await page
    .getByRole("button", { name: "Registrar gasto", exact: true })
    .click();
  await page.getByLabel("Concepto", { exact: true }).fill("Arriendo oficina");
  await page.getByLabel("Categoría", { exact: true }).fill("Arriendo");
  await page.getByLabel("Monto (COP)", { exact: true }).fill("10000.25");
  await page.getByLabel("Gasto recurrente", { exact: true }).check();
  await page.getByRole("button", { name: "Revisar gasto" }).click();
}
test("finanzas usa resultado y presupuesto del servidor y filtros del mes", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/finanzas?mes=2026-10");
  await expect(page.locator("tbody")).toContainText("Transporte Bogotá");
  await expect(page.locator(".finance-stats")).toContainText("32.123,75");
  await expect(page.getByText("Presupuesto excedido")).toBeVisible();
  await page.getByLabel("Buscar gasto").fill("bogota");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByLabel("Tipo de gasto").selectOption("si");
  await expect(page.getByText("No hay gastos para mostrar")).toBeVisible();
  await page.getByLabel("Mes de consulta").fill("2026-09");
  await expect(page).toHaveURL(/mes=2026-09/);
});
test("gasto revisado guarda una vez y envía autor período y monto exactos", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/finanzas?mes=2026-10");
  await fill(page);
  await page.getByRole("button", { name: "Confirmar gasto" }).dblclick();
  await expect(
    page.getByRole("heading", { name: "Gasto registrado" }),
  ).toBeVisible();
  expect(state.writes()).toBe(1);
  expect(state.body()).toEqual({
    concepto: "Arriendo oficina",
    categoria: "Arriendo",
    monto: 10000.25,
    mes_referencia: "2026-10-01",
    recurrente: true,
    registrado_por: id,
  });
  await page.getByRole("button", { name: "Volver a finanzas" }).click();
  await expect(page.locator("tbody")).toContainText("Arriendo oficina");
});
test("envío incierto persiste bloqueo al reabrir", async ({ page }) => {
  const state = await setup(page, { uncertain: true });
  await page.goto("/finanzas");
  await fill(page);
  await page.getByRole("button", { name: "Confirmar gasto" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Revisa el historial antes de volver a registrar",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Consultar historial" }).click();
  await page
    .getByRole("button", { name: "Registrar gasto", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Habilitar nuevo intento" }),
  ).toBeDisabled();
  expect(state.writes()).toBe(1);
});
test("resumen fallido conserva gastos sin mostrar ceros inventados", async ({
  page,
}) => {
  await setup(page, { failure: true });
  await page.goto("/finanzas");
  await expect(page.getByRole("alert")).toContainText("No pudimos cargar");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator(".finance-stats")).not.toContainText("$");
});
test("vendedor no consulta finanzas incluso por URL", async ({ page }) => {
  await setup(page, { role: "VENDEDOR" });
  let calls = 0;
  page.on("request", (r) => {
    if (
      r.url().includes("/rest/v1/") &&
      /\/gastos|resumen_financiero/.test(r.url())
    )
      calls++;
  });
  await page.goto("/finanzas");
  await expect(
    page.getByRole("heading", { name: "Acceso restringido" }),
  ).toBeVisible();
  expect(calls).toBe(0);
});
test("formulario y finanzas móvil sin desborde y monto inválido bloqueado", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/finanzas");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.screenshot({
    path: "output/frontend/finanzas-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Registrar gasto", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Revisar gasto" }),
  ).toBeDisabled();
  await page.getByLabel("Concepto", { exact: true }).fill("Prueba");
  await page.getByLabel("Categoría", { exact: true }).fill("Servicios");
  await page.getByLabel("Monto (COP)", { exact: true }).fill("10.123");
  await expect(
    page.getByRole("button", { name: "Revisar gasto" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "output/frontend/gasto-mobile.png",
    fullPage: true,
  });
});
test("crear, editar y eliminar gasto actualiza el total gastado, resultado del mes y saldo disponible una sola vez", async ({
  page,
}) => {
  await mock(page, { role: "ADMIN" });
  let rows = [{ ...expense }];
  const ventasMes = 200000;
  const presupuestoLimite = 100000;
  let posts = 0;
  let patches = 0;
  let deletes = 0;

  await page.route(`${api}/rest/v1/rpc/resumen_financiero_mensual`, (r) => {
    const totalGastos = Number(
      rows.reduce((acc, g) => acc + g.monto, 0).toFixed(2),
    );
    return r.fulfill({
      json: [
        {
          total_ventas: ventasMes,
          total_gastos: totalGastos,
          ganancia_neta: Number((ventasMes - totalGastos).toFixed(2)),
          presupuesto_limite: presupuestoLimite,
          excede_presupuesto: totalGastos > presupuestoLimite,
        },
      ],
    });
  });

  await page.route(`${api}/rest/v1/gastos*`, async (r) => {
    const method = r.request().method();
    const url = new URL(r.request().url());

    if (method === "POST") {
      posts++;
      const body = r.request().postDataJSON();
      const created = {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        created_at: now,
        ...body,
      };
      rows = [created, ...rows];
      await new Promise((res) => setTimeout(res, 60));
      return r.fulfill({ json: created });
    }

    if (method === "PATCH") {
      patches++;
      const body = r.request().postDataJSON();
      const targetId = url.searchParams.get("id")?.replace("eq.", "");
      rows = rows.map((item) =>
        item.id === targetId ? { ...item, ...body } : item,
      );
      const updated = rows.find((item) => item.id === targetId);
      await new Promise((res) => setTimeout(res, 60));
      return r.fulfill({ json: updated });
    }

    if (method === "DELETE") {
      deletes++;
      const targetId = url.searchParams.get("id")?.replace("eq.", "");
      const deleted = rows.filter((item) => item.id === targetId);
      rows = rows.filter((item) => item.id !== targetId);
      await new Promise((res) => setTimeout(res, 60));
      return r.fulfill({ json: deleted });
    }

    return r.fulfill({ json: rows });
  });

  await page.goto("/finanzas?mes=2026-10");

  // Estado inicial: Ventas $200.000 | Gastos $50.000,25 | Resultado $149.999,75 | Disponible $49.999,75
  await expect(page.locator(".finance-stats")).toContainText("200.000");
  await expect(page.locator(".finance-stats")).toContainText("50.000,25");
  await expect(page.locator(".finance-stats")).toContainText("149.999,75");
  await expect(page.locator(".finance-budget")).toContainText("49.999,75");
  await expect(page.getByText("Dentro del presupuesto")).toBeVisible();

  // 1. CREAR GASTO ($20.000) -> Gastos $70.000,25 | Resultado $129.999,75 | Disponible $29.999,75
  await page
    .getByRole("button", { name: "Registrar gasto", exact: true })
    .click();
  await page
    .getByLabel("Concepto", { exact: true })
    .fill("Papelería e insumos");
  await page.getByLabel("Categoría", { exact: true }).fill("Administración");
  await page.getByLabel("Monto (COP)", { exact: true }).fill("20000");
  await page.getByRole("button", { name: "Revisar gasto" }).click();
  await page.getByRole("button", { name: "Confirmar gasto" }).dblclick();
  await expect(
    page.getByRole("heading", { name: "Gasto registrado" }),
  ).toBeVisible();
  expect(posts).toBe(1);
  await page.getByRole("button", { name: "Volver a finanzas" }).click();

  await expect(page.locator("tbody")).toContainText("Papelería e insumos");
  await expect(page.locator(".finance-stats")).toContainText("70.000,25");
  await expect(page.locator(".finance-stats")).toContainText("129.999,75");
  await expect(page.locator(".finance-budget")).toContainText("29.999,75");

  // 2. EDITAR GASTO ($20.000 -> $35.000) -> Gastos $85.000,25 | Resultado $114.999,75 | Disponible $14.999,75
  await page
    .getByRole("button", { name: "Editar gasto Papelería e insumos" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Editar gasto" }),
  ).toBeVisible();
  // Sin cambios no permite revisar
  await expect(
    page.getByRole("button", { name: "Revisar cambios" }),
  ).toBeDisabled();
  // Monto inválido con 3 decimales no permite revisar
  await page.getByLabel("Monto (COP)").fill("35000.123");
  await expect(
    page.getByRole("button", { name: "Revisar cambios" }),
  ).toBeDisabled();

  await page.getByLabel("Concepto").fill("Papelería y cafetería");
  await page.getByLabel("Monto (COP)").fill("35000");
  await page.getByRole("button", { name: "Revisar cambios" }).click();
  await expect(page.getByText("Monto anterior: $ 20.000")).toBeVisible();
  await page.getByRole("button", { name: "Confirmar cambios" }).dblclick();
  await expect(
    page.getByRole("heading", { name: "Gasto actualizado" }),
  ).toBeVisible();
  expect(patches).toBe(1);
  await page.getByRole("button", { name: "Volver a finanzas" }).click();

  await expect(page.locator("tbody")).toContainText("Papelería y cafetería");
  await expect(page.locator("tbody")).toContainText("20.000,00");
  await expect(page.locator("tbody")).toContainText("Editado (antes");
  await expect(page.locator(".finance-stats")).toContainText("85.000,25");
  await expect(page.locator(".finance-stats")).toContainText("114.999,75");
  await expect(page.locator(".finance-budget")).toContainText("14.999,75");

  // 3. ELIMINAR GASTO CON CONFIRMACIÓN PREVIA ($35.000) -> Revierte a Gastos $50.000,25 | Disponible $49.999,75
  await page
    .getByRole("button", { name: "Eliminar gasto Papelería y cafetería" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Eliminar gasto" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancelar" }).click();
  expect(deletes).toBe(0);
  await expect(page.locator("tbody")).toContainText("Papelería y cafetería");

  await page
    .getByRole("button", { name: "Eliminar gasto Papelería y cafetería" })
    .click();
  await page
    .getByRole("button", { name: "Confirmar eliminación" })
    .dblclick();
  await expect(
    page.getByRole("heading", { name: "Gasto eliminado" }),
  ).toBeVisible();
  expect(deletes).toBe(1);
  await page.getByRole("button", { name: "Volver a finanzas" }).click();

  await expect(page.locator("tbody")).not.toContainText(
    "Papelería y cafetería",
  );
  await expect(page.locator(".finance-stats")).toContainText("50.000,25");
  await expect(page.locator(".finance-stats")).toContainText("149.999,75");
  await expect(page.locator(".finance-budget")).toContainText("49.999,75");
});
test("restricción contable al eliminar gasto muestra alerta y conserva el registro", async ({
  page,
}) => {
  await setup(page);
  await page.route(`${api}/rest/v1/gastos*`, async (r) => {
    if (r.request().method() === "DELETE") {
      return r.fulfill({
        status: 409,
        json: { code: "23503", message: "Foreign key violation" },
      });
    }
    return r.fulfill({ json: [expense] });
  });

  await page.goto("/finanzas?mes=2026-10");
  await page
    .getByRole("button", { name: "Eliminar gasto Transporte Bogotá" })
    .click();
  await page.getByRole("button", { name: "Confirmar eliminación" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "No se puede eliminar este gasto porque está vinculado a otros documentos o registros protegidos.",
  );
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.locator("tbody")).toContainText("Transporte Bogotá");
});
