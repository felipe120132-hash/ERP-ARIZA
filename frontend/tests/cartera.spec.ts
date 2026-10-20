import { test, expect, type Page } from "@playwright/test";
import { mock, api, id, now } from "./fixtures";
const clientId = "77777777-7777-4777-8777-777777777777",
  otherId = "88888888-8888-4888-8888-888888888888",
  saleId = "99999999-9999-4999-8999-999999999999",
  paymentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const customer = {
  id: clientId,
  nombre_tienda: "Mercado San José",
  contacto: "Laura Pérez",
  telefono: "3001234567",
  direccion: "Calle 10 # 5-20",
  tipo_cliente: "TIENDA",
  saldo_cartera: 150000.5,
  en_mora: true,
  activo: true,
  created_at: now,
  updated_at: now,
};
const sale = {
  id: saleId,
  consecutivo: 2101,
  cliente_id: clientId,
  vendedor_id: id,
  tipo_pago: "CREDITO",
  aplica_iva: true,
  subtotal: 100000,
  iva: 19000,
  total: 119000,
  estado: "PENDIENTE",
  pdf_url: null,
  fecha: now,
  created_at: now,
};
async function setup(page: Page, { readFail = false, empty = false } = {}) {
  await mock(page);
  let balance = customer.saldo_cartera;
  let payments: object[] = [];
  let writes = 0;
  let payload: Record<string, unknown> | null = null;
  await page.route(`${api}/rest/v1/clientes*`, (route) => {
    const single = route.request().url().includes("id=eq.");
    return route.fulfill(
      readFail
        ? {
            status: 500,
            json: { message: "Consulta de clientes no disponible" },
          }
        : {
            json: single
              ? { ...customer, saldo_cartera: balance }
              : empty
                ? []
                : [
                    { ...customer, saldo_cartera: balance },
                    {
                      ...customer,
                      id: otherId,
                      nombre_tienda: "Distribuidor Norte",
                      tipo_cliente: "DISTRIBUIDOR",
                      saldo_cartera: 0,
                      en_mora: false,
                      activo: false,
                    },
                  ],
          },
    );
  });
  await page.route(`${api}/rest/v1/remisiones*`, (route) =>
    route.fulfill({
      json: [
        sale,
        {
          ...sale,
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          estado: "ANULADA",
          consecutivo: 2102,
        },
        {
          ...sale,
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          tipo_pago: "CONTADO",
          consecutivo: 2103,
        },
        {
          ...sale,
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          cliente_id: otherId,
          consecutivo: 2104,
        },
      ],
    }),
  );
  await page.route(`${api}/rest/v1/abonos_cartera*`, (route) =>
    route.fulfill({ json: payments }),
  );
  await page.route(`${api}/rest/v1/rpc/registrar_abono`, async (route) => {
    writes++;
    payload = route.request().postDataJSON();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const input = payload!;
    balance -= Number(input.p_monto);
    payments = [
      {
        id: paymentId,
        cliente_id: clientId,
        remision_id: input.p_remision_id,
        monto: input.p_monto,
        metodo_pago: input.p_metodo_pago,
        fecha: now,
        registrado_por: id,
        created_at: now,
      },
    ];
    await route.fulfill({ json: paymentId });
  });
  await page.goto("/cartera");
  return { writes: () => writes, payload: () => payload };
}
async function openForm(page: Page) {
  await page
    .getByRole("button", { name: "Registrar abono a Mercado San José" })
    .click();
  await expect(page.getByLabel("Monto recibido (COP)")).toBeVisible();
}
test("cartera: búsqueda sin tildes, filtros y cliente sin saldo", async ({
  page,
}) => {
  await setup(page);
  await expect(page.getByRole("row")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Registrar abono a Distribuidor Norte" }),
  ).toBeDisabled();
  await page.screenshot({
    path: "output/frontend/cartera-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("Buscar cliente", { exact: true }).fill("jose");
  await expect(page.getByRole("row")).toHaveCount(2);
  await page.getByLabel("Buscar cliente", { exact: true }).fill("");
  await page.getByLabel("Estado de cartera").selectOption("sin-saldo");
  await expect(page.getByRole("row")).toHaveCount(2);
  await expect(page.getByRole("table")).toContainText("Distribuidor Norte");
  await page.reload();
  await expect(page.getByLabel("Estado de cartera")).toHaveValue("sin-saldo");
});
test("abono general: único envío, payload exacto y saldo consultado de nuevo", async ({
  page,
}) => {
  const probe = await setup(page);
  await openForm(page);
  await page.getByLabel("Monto recibido (COP)").fill("25000.25");
  await page.getByLabel("Método de pago").selectOption("TRANSFERENCIA");
  await page.getByRole("button", { name: "Revisar abono" }).click();
  await page
    .getByRole("dialog")
    .screenshot({ path: "output/frontend/abono-desktop.png" });
  await page
    .getByRole("button", { name: "Confirmar abono", exact: true })
    .dblclick();
  await expect(
    page.getByRole("heading", { name: "Abono registrado" }),
  ).toBeVisible();
  expect(probe.writes()).toBe(1);
  expect(probe.payload()).toEqual({
    p_cliente_id: clientId,
    p_monto: 25000.25,
    p_metodo_pago: "TRANSFERENCIA",
    p_remision_id: null,
  });
  await page.getByRole("link", { name: "Ver historial del cliente" }).click();
  await expect(page.locator(".client-balance")).toContainText("125.000,25");
  await expect(page.getByRole("table")).toContainText(paymentId);
  await page.getByRole("button", { name: "Remisiones (3)" }).click();
  await expect(page.getByRole("table")).toContainText("PENDIENTE");
});
test("validación de monto y remisiones del cliente elegibles", async ({
  page,
}) => {
  await setup(page);
  await openForm(page);
  for (const amount of ["0", "-1", "150001", "1.001"]) {
    await page.getByLabel("Monto recibido (COP)").fill(amount);
    await expect(
      page.getByRole("button", { name: "Revisar abono" }),
    ).toBeDisabled();
  }
  await page.getByLabel("Monto recibido (COP)").fill("10.5");
  await expect(
    page.getByRole("button", { name: "Revisar abono" }),
  ).toBeEnabled();
  await expect(
    page.getByLabel("Aplicación del abono").getByRole("option"),
  ).toHaveCount(2);
  await page.getByLabel("Aplicación del abono").selectOption(saleId);
  await page.getByRole("button", { name: "Revisar abono" }).click();
  await expect(page.locator(".order-review")).toContainText("Remisión #2101");
});
test("abono asociado usa remisión y Bancolombia", async ({ page }) => {
  const probe = await setup(page);
  await openForm(page);
  await page.getByLabel("Monto recibido (COP)").fill("500");
  await page.getByLabel("Método de pago").selectOption("BANCOLOMBIA");
  await page.getByLabel("Aplicación del abono").selectOption(saleId);
  await page.getByRole("button", { name: "Revisar abono" }).click();
  await page
    .getByRole("button", { name: "Confirmar abono", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Abono registrado" }),
  ).toBeVisible();
  expect(probe.payload()?.p_remision_id).toBe(saleId);
  expect(probe.payload()?.p_metodo_pago).toBe("BANCOLOMBIA");
});
test("rechazo del backend conserva formulario", async ({ page }) => {
  await setup(page);
  await page.route(`${api}/rest/v1/rpc/registrar_abono`, (route) =>
    route.fulfill({
      status: 400,
      json: { code: "P0001", message: "El monto supera el saldo actual" },
    }),
  );
  await openForm(page);
  await page.getByLabel("Monto recibido (COP)").fill("100");
  await page.getByRole("button", { name: "Revisar abono" }).click();
  await page
    .getByRole("button", { name: "Confirmar abono", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("supera el saldo");
  await expect(page.getByLabel("Monto recibido (COP)")).toHaveValue("100");
  await expect(
    page.getByRole("button", { name: "Revisar abono" }),
  ).toBeEnabled();
});
test("respuesta incierta mantiene bloqueo al cerrar y reabrir", async ({
  page,
}) => {
  await setup(page);
  await page.route(`${api}/rest/v1/rpc/registrar_abono`, (route) =>
    route.abort(),
  );
  await openForm(page);
  await page.getByLabel("Monto recibido (COP)").fill("100");
  await page.getByRole("button", { name: "Revisar abono" }).click();
  await page
    .getByRole("button", { name: "Confirmar abono", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("reenvío está bloqueado");
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page
    .getByRole("button", { name: "Registrar abono a Mercado San José" })
    .click();
  await expect(page.getByRole("alert")).toContainText("reenvío está bloqueado");
  await expect(page.getByLabel("Monto recibido (COP)")).toHaveCount(0);
});
test("fallo de recarga tras pago confirmado no reenvía abono", async ({
  page,
}) => {
  const probe = await setup(page);
  await openForm(page);
  await page.getByLabel("Monto recibido (COP)").fill("100");
  await page.getByRole("button", { name: "Revisar abono" }).click();
  await page.route(`${api}/rest/v1/clientes*`, (route) =>
    route.fulfill({
      status: 500,
      json: { message: "Lectura temporalmente no disponible" },
    }),
  );
  await page
    .getByRole("button", { name: "Confirmar abono", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Abono registrado" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.getByRole("button", { name: "Reintentar cartera" }).click();
  await expect(
    page.getByRole("button", { name: "Reintentar cartera" }),
  ).toBeVisible();
  expect(probe.writes()).toBe(1);
});
test("historial y formulario móvil sin desbordes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page
    .getByRole("link", { name: "Ver historial de Mercado San José" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Mercado San José", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Todavía no hay abonos registrados" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "output/frontend/cliente-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Registrar abono", exact: true })
    .click();
  await expect(page.getByLabel("Monto recibido (COP)")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("dialog")
    .screenshot({ path: "output/frontend/abono-mobile.png" });
});
test("cartera vacía y errores recuperables", async ({ page }) => {
  await setup(page, { empty: true });
  await expect(
    page.getByRole("heading", { name: "No hay clientes para mostrar" }),
  ).toBeVisible();
  await page.route(`${api}/rest/v1/clientes*`, (route) =>
    route.fulfill({ status: 500, json: { message: "Servicio no disponible" } }),
  );
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reintentar cartera" }),
  ).toBeVisible();
});

test("edición controlada de abono actualiza saldo del cliente, saldo de remisión y conserva trazabilidad", async ({
  page,
}) => {
  await mock(page, { role: "ADMIN" });
  let balance = 125000.25;
  let currentPayment = {
    id: paymentId,
    cliente_id: clientId,
    remision_id: saleId,
    monto: 25000.25,
    metodo_pago: "TRANSFERENCIA",
    fecha: now,
    registrado_por: id,
    created_at: now,
  };
  await page.route(`${api}/rest/v1/clientes*`, (route) => {
    const req = route.request();
    if (req.method() === "PATCH") {
      const body = req.postDataJSON();
      balance = body.saldo_cartera;
      return route.fulfill({ json: { ...customer, saldo_cartera: balance } });
    }
    const single = req.url().includes("id=eq.");
    return route.fulfill({
      json: single
        ? { ...customer, saldo_cartera: balance }
        : [{ ...customer, saldo_cartera: balance }],
    });
  });
  await page.route(`${api}/rest/v1/remisiones*`, (route) =>
    route.fulfill({ json: [sale] }),
  );
  await page.route(`${api}/rest/v1/abonos_cartera*`, (route) => {
    const req = route.request();
    if (req.method() === "PATCH") {
      const body = req.postDataJSON();
      currentPayment = { ...currentPayment, ...body };
      return route.fulfill({ json: currentPayment });
    }
    return route.fulfill({ json: [currentPayment] });
  });
  await page.route(`${api}/rest/v1/rpc/editar_abono_cartera`, (route) => {
    const body = route.request().postDataJSON();
    const prevBalance = balance;
    balance = Math.round((balance + currentPayment.monto - body.p_monto) * 100) / 100;
    const prevMonto = currentPayment.monto;
    currentPayment = {
      ...currentPayment,
      monto: body.p_monto,
      metodo_pago: body.p_metodo_pago,
      remision_id: body.p_remision_id,
    };
    return route.fulfill({
      json: {
        abono_id: paymentId,
        cliente_id: clientId,
        monto_anterior: prevMonto,
        monto_nuevo: body.p_monto,
        saldo_anterior: prevBalance,
        saldo_resultante: balance,
        motivo: body.p_motivo,
      },
    });
  });

  await page.goto(`/cartera/${clientId}`);
  // Verificar saldo antes de editar abono ($125.000,25)
  await expect(page.locator(".client-balance")).toContainText("125.000,25");
  await expect(page.getByRole("table")).toContainText("25.000,25");

  // Abrir edición de abono
  await page.getByRole("button", { name: `Editar abono ${paymentId}` }).click();
  await expect(page.getByRole("heading", { name: "Editar abono" })).toBeVisible();

  // Validar que un monto superior al total de la remisión ($119.000) sea rechazado
  await page.getByLabel("Nuevo monto del abono (COP)").fill("130000");
  await page
    .getByLabel("Motivo de la corrección")
    .fill("Error en lectura de soporte bancario");
  await expect(
    page.getByRole("button", { name: "Revisar corrección" }),
  ).toBeDisabled();

  // Ingresar nuevo monto válido ($50.000,50 -> reduce saldo en $25.000,25 adicionales -> nuevo saldo $100.000,00)
  await page.getByLabel("Nuevo monto del abono (COP)").fill("50000.50");
  await page.getByRole("button", { name: "Revisar corrección" }).click();
  await expect(page.locator(".order-review")).toContainText("100.000,00");
  await page.getByRole("button", { name: "Confirmar corrección" }).click();
  await expect(
    page.getByRole("heading", { name: "Abono actualizado" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cerrar y ver historial" }).click();

  // Verificar saldo después de editar abono ($100.000,00) y trazabilidad en tabla
  await expect(page.locator(".client-balance")).toContainText("100.000,00");
  await expect(page.getByRole("table")).toContainText("50.000,50");
  await expect(page.getByRole("table")).toContainText(
    "Error en lectura de soporte bancario",
  );

  // Verificar coherencia en pestaña de Remisiones (Total $119.000, Abonado $50.000,50, Saldo remisión $68.999,50)
  await page.getByRole("button", { name: "Remisiones (1)" }).click();
  await expect(page.getByRole("table")).toContainText("119.000,00");
  await expect(page.getByRole("table")).toContainText("50.000,50");
  await expect(page.getByRole("table")).toContainText("68.999,50");
});
