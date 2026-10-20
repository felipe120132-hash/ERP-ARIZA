import { test, expect, type Page } from "@playwright/test";
import { mock, api, products } from "./fixtures";
const image = "src/assets/ariza-logo.png";
async function setup(
  page: Page,
  {
    role = "ADMIN",
    fail = false,
    denied = false,
    duplicate = false,
    photoFail = false,
    initialPhoto = null as string | null,
  } = {},
) {
  await mock(page, { role });
  let product = { ...products[0], imagen_path: initialPhoto };
  const writes: { method: string; body: any; url: string }[] = [];
  const uploads: string[] = [];
  await page.route(`${api}/rest/v1/productos*`, async (r) => {
    const req = r.request(),
      url = req.url();
    if (req.method() !== "GET") {
      const body = req.postDataJSON();
      writes.push({ method: req.method(), body, url });
      if (denied)
        return r.fulfill({
          status: 403,
          json: { code: "42501", message: "No autorizado" },
        });
      if (duplicate)
        return r.fulfill({
          status: 409,
          json: { code: "23505", message: "SKU duplicado" },
        });
      if (photoFail && body.imagen_path)
        return r.fulfill({ status: 500, json: { message: "No confirmado" } });
      product = { ...product, ...body };
      if (fail) return r.abort();
      return r.fulfill({ json: product });
    }
    if (url.includes("id=eq.")) return r.fulfill({ json: product });
    return r.fulfill({
      json: [product, { ...products[1], activo: false }],
      headers: {
        "content-range": "0-1/2",
        "access-control-expose-headers": "content-range",
      },
    });
  });
  await page.route(`${api}/storage/v1/**`, async (r) => {
    const url = r.request().url();
    if (url.includes("/object/sign/") && r.request().method() === "POST")
      return r.fulfill({
        json: [
          {
            path: product.imagen_path,
            signedURL: "/object/sign/productos-imagenes/test.png?token=fake",
            error: null,
          },
        ],
      });
    if (r.request().method() === "POST") {
      uploads.push(url);
      return r.fulfill({ json: { Key: url.split("/object/")[1] } });
    }
    return r.fulfill({ path: image, contentType: "image/png" });
  });
  return { writes, uploads };
}
async function edit(page: Page) {
  await page.goto(`/productos/${products[0].id}/editar`);
  await expect(
    page.getByLabel("Nombre del producto", { exact: true }),
  ).toHaveValue(products[0].nombre);
}
test("productos: listado incluye inactivos y permite buscar y abrir editor", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/productos");
  await expect(
    page.getByRole("link", { name: "Editar Café de origen" }),
  ).toBeVisible();
  await page.getByLabel("Actividad del producto").selectOption("inactivos");
  await expect(
    page.getByRole("link", { name: "Editar Café de origen" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Editar Producto 1" }),
  ).toBeVisible();
  await page.getByLabel("Actividad del producto").selectOption("todos");
  await page.getByLabel("Buscar productos para administrar").fill("cafe");
  await page.getByRole("link", { name: "Editar Café de origen" }).click();
  await expect(
    page.getByRole("heading", { name: "Editar producto" }),
  ).toBeVisible();
});
test("productos: creación confirmada sin stock ni imagen ni datos ajenos", async ({
  page,
}) => {
  const { writes } = await setup(page);
  await page.goto("/productos/nuevo");
  await page.getByLabel("SKU", { exact: true }).fill("AR-NUEVO");
  await page
    .getByLabel("Nombre del producto", { exact: true })
    .fill("Filtro de acuario");
  await page.getByLabel("Categoría", { exact: true }).selectOption("Accesorios");
  await page.getByLabel("Origen", { exact: true }).selectOption("Importado");
  await page.getByLabel("Precio tienda (COP)", { exact: true }).fill("1234.56");
  await page
    .getByRole("button", { name: "Revisar producto", exact: true })
    .click();
  expect(writes).toHaveLength(0);
  await page
    .getByRole("button", { name: "Confirmar producto", exact: true })
    .dblclick();
  await expect(page).toHaveURL(/productos\/[\da-f-]+\/editar/);
  expect(writes).toHaveLength(1);
  expect(writes[0].method).toBe("POST");
  expect(Object.keys(writes[0].body).sort()).toEqual(
    [
      "id",
      "sku",
      "nombre",
      "categoria",
      "origen",
      "precio_tienda",
      "precio_distribuidor",
      "tasa_iva",
      "stock_minimo",
      "activo",
    ].sort(),
  );
  expect(writes[0].body.precio_tienda).toBe(1234.56);
  await expect(page.getByLabel("Seleccionar foto")).toBeVisible();
});
test("productos: edición y desactivación conservan stock e historial", async ({
  page,
}) => {
  const { writes } = await setup(page);
  await edit(page);
  await page.getByLabel("Producto activo", { exact: true }).uncheck();
  await page.getByLabel("Stock mínimo", { exact: true }).fill("5.25");
  await page.getByLabel("IVA del producto").selectOption("5");
  await page
    .getByRole("button", { name: "Revisar producto", exact: true })
    .click();
  await expect(
    page.getByText("Su historial se conserva.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirmar producto", exact: true })
    .click();
  await expect(
    page.getByText("Producto guardado correctamente."),
  ).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0].body).toMatchObject({
    activo: false,
    stock_minimo: 5.25,
    tasa_iva: 5,
  });
  expect(writes[0].body).not.toHaveProperty("stock_actual");
  expect(writes[0].body).not.toHaveProperty("imagen_path");
  expect(writes[0].url).toContain("precio_tienda=eq.18000");
});
test("productos: SKU duplicado no reporta éxito", async ({ page }) => {
  const { writes } = await setup(page, { duplicate: true });
  await edit(page);
  await page
    .getByRole("button", { name: "Revisar producto", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmar producto", exact: true })
    .click();
  await expect(
    page.getByText("Ese SKU ya existe. Usa uno diferente."),
  ).toBeVisible();
  expect(writes).toHaveLength(1);
  await expect(page.getByText("Producto guardado correctamente.")).toHaveCount(
    0,
  );
});
test("productos: guardado incierto persiste y se reconcilia sin reenviar", async ({
  page,
}) => {
  const { writes } = await setup(page, { fail: true });
  await edit(page);
  await page
    .getByLabel("Nombre del producto", { exact: true })
    .fill("Filtro actualizado");
  await page
    .getByRole("button", { name: "Revisar producto", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmar producto", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Verifica el resultado del último cambio",
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Revisar producto", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Consultar resultado" }).click();
  await expect(
    page.getByText("El cambio está confirmado en el producto."),
  ).toBeVisible();
  expect(writes).toHaveLength(1);
});
test("productos: vendedor no consulta administración ni muestra accesos", async ({
  page,
}) => {
  await setup(page, { role: "VENDEDOR" });
  let calls = 0;
  page.on("request", (r) => {
    if (r.url().includes("/rest/v1/productos")) calls++;
  });
  await page.goto("/productos");
  await expect(
    page.getByRole("heading", { name: "Acceso restringido" }),
  ).toBeVisible();
  await page.goto(`/productos/${products[0].id}/editar`);
  await expect(
    page.getByRole("heading", { name: "Acceso restringido" }),
  ).toBeVisible();
  expect(calls).toBe(0);
});
test("foto: validación, confirmación, ruta privada nueva y borrador conservado", async ({
  page,
}) => {
  const { writes, uploads } = await setup(page);
  await edit(page);
  await page.getByLabel("Seleccionar foto").setInputFiles({
    name: "falsa.png",
    mimeType: "image/png",
    buffer: Buffer.from("no es una imagen"),
  });
  await expect(
    page.getByText(
      "El contenido del archivo no corresponde a su formato de imagen.",
    ),
  ).toBeVisible();
  expect(uploads).toHaveLength(0);
  await page
    .getByLabel("Nombre del producto", { exact: true })
    .fill("Borrador sin guardar");
  await page.getByLabel("Seleccionar foto").setInputFiles(image);
  await expect(
    page.getByAltText("Vista previa de la nueva foto"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Revisar foto", exact: true }).click();
  expect(uploads).toHaveLength(0);
  await page
    .getByRole("button", { name: "Confirmar foto", exact: true })
    .dblclick();
  await expect(
    page.getByText("Foto guardada. Ya está disponible en el catálogo."),
  ).toBeVisible();
  expect(uploads).toHaveLength(1);
  expect(writes).toHaveLength(1);
  expect(Object.keys(writes[0].body)).toEqual(["imagen_path"]);
  expect(writes[0].body.imagen_path).toMatch(
    new RegExp(`^productos/${products[0].id}/[\\da-f-]+\\.png$`),
  );
  expect(writes[0].url).toContain("imagen_path=is.null");
  await expect(
    page.getByLabel("Nombre del producto", { exact: true }),
  ).toHaveValue("Borrador sin guardar");
  await expect(
    page.getByAltText(`Foto de ${products[0].nombre}`),
  ).toHaveJSProperty("naturalWidth", 334);
  await page.goto("/catalogo");
  await expect(
    page.getByRole("article").getByAltText(products[0].nombre),
  ).toHaveJSProperty("naturalWidth", 334);
});
test("foto: asociación fallida bloquea reenvío y conserva foto anterior", async ({
  page,
}) => {
  const { writes, uploads } = await setup(page, {
    photoFail: true,
    initialPhoto: "sku/old.png",
  });
  await edit(page);
  await page.getByLabel("Seleccionar foto").setInputFiles(image);
  await page.getByRole("button", { name: "Revisar foto", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirmar foto", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Verifica el resultado del último cambio",
    }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Seleccionar foto")).toBeDisabled();
  expect(uploads).toHaveLength(1);
  expect(writes).toHaveLength(1);
  expect(new URL(writes[0].url).searchParams.get("imagen_path")).toBe(
    "eq.sku/old.png",
  );
  await expect(
    page.getByAltText(`Foto de ${products[0].nombre}`),
  ).toHaveJSProperty("naturalWidth", 334);
});
test("productos: escritorio y móvil sin desbordes", async ({ page }) => {
  await setup(page);
  await edit(page);
  await page.screenshot({
    path: "output/frontend/producto-editor-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Seleccionar foto")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "output/frontend/producto-editor-mobile.png",
    fullPage: true,
  });
  await page.goto("/productos");
  await expect(
    page.getByRole("link", { name: "Editar Café de origen" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("productos: rechazo RLS conserva el formulario sin éxito", async ({
  page,
}) => {
  const { writes } = await setup(page, { denied: true });
  await edit(page);
  await page.getByLabel("Precio tienda (COP)", { exact: true }).fill("15000");
  await page
    .getByRole("button", { name: "Revisar producto", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmar producto", exact: true })
    .click();
  await expect(
    page.getByText("No tienes permisos para guardar este producto."),
  ).toBeVisible();
  await expect(
    page.getByLabel("Precio tienda (COP)", { exact: true }),
  ).toHaveValue("15000");
  expect(writes).toHaveLength(1);
  await expect(page.getByText("Producto guardado correctamente.")).toHaveCount(
    0,
  );
});

test("productos: validación de precisión y tamaño evita escrituras", async ({
  page,
}) => {
  const { writes, uploads } = await setup(page);
  await edit(page);
  await page.getByLabel("Precio tienda (COP)", { exact: true }).fill("1.001");
  await page
    .getByRole("button", { name: "Revisar producto", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirmar producto", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Seleccionar foto").setInputFiles({
    name: "grande.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  });
  await expect(
    page.getByText("La imagen debe pesar entre 1 byte y 5 MB."),
  ).toBeVisible();
  expect(writes).toHaveLength(0);
  expect(uploads).toHaveLength(0);
});

test("productos: listado recorre páginas del servidor y detecta consulta incompleta", async ({
  page,
}) => {
  await setup(page);
  const offsets: number[] = [];
  await page.route(`${api}/rest/v1/productos*`, (r) => {
    const url = new URL(r.request().url());
    const offset = Number(url.searchParams.get("offset"));
    offsets.push(offset);
    return r.fulfill({
      json: [products[offset ? 1 : 0]],
      headers: {
        "content-range": `${offset}-${offset}/2`,
        "access-control-expose-headers": "content-range",
      },
    });
  });
  await page.goto("/productos");
  await expect(
    page.getByRole("link", { name: "Editar Producto 1" }),
  ).toBeVisible();
  expect([...new Set(offsets)].sort()).toEqual([0, 1]);
  await page.route(`${api}/rest/v1/productos*`, (r) => r.fulfill({ json: [] }));
  await page.getByRole("button", { name: "Actualizar productos" }).click();
  await expect(
    page.getByText(
      "El listado cambió o está incompleto. Actualiza los productos.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Editar Producto 1" }),
  ).toHaveCount(0);
});

test("productos: eliminación segura desactiva si hay historial y elimina físicamente si no hay dependencias", async ({
  page,
}) => {
  await mock(page, { role: "ADMIN" });
  const conHistorial = { ...products[0], stock_actual: 0, activo: true };
  const sinHistorial = { ...products[1], stock_actual: 0, activo: true };
  let lista = [conHistorial, sinHistorial];
  const methods: string[] = [];

  await page.route(`${api}/rest/v1/kardex*`, (r) => {
    const url = r.request().url();
    const hasHistory = url.includes(conHistorial.id);
    return r.fulfill({
      json: hasHistory ? [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }] : [],
      headers: {
        "access-control-expose-headers": "content-range",
        "content-range": hasHistory ? "0-0/1" : "*/0",
      },
    });
  });
  await page.route(`${api}/rest/v1/detalles_remision*`, (r) =>
    r.fulfill({
      json: [],
      headers: {
        "access-control-expose-headers": "content-range",
        "content-range": "*/0",
      },
    }),
  );
  await page.route(`${api}/rest/v1/precios_cliente*`, (r) =>
    r.fulfill({ json: [] }),
  );
  await page.route(`${api}/rest/v1/productos*`, (r) => {
    const req = r.request();
    if (req.method() === "PATCH") {
      methods.push("PATCH");
      const body = req.postDataJSON();
      lista = lista.map((p) =>
        req.url().includes(p.id) ? { ...p, ...body } : p,
      );
      return r.fulfill({
        json: lista.find((p) => req.url().includes(p.id)),
      });
    }
    if (req.method() === "DELETE") {
      methods.push("DELETE");
      const deleted = lista.find((p) => req.url().includes(p.id));
      lista = lista.filter((p) => !req.url().includes(p.id));
      return r.fulfill({ json: deleted ? [{ id: deleted.id }] : [] });
    }
    return r.fulfill({
      json: lista,
      headers: {
        "access-control-expose-headers": "content-range",
        "content-range": `0-${Math.max(0, lista.length - 1)}/${lista.length}`,
      },
    });
  });

  await page.goto("/productos");
  // 1. Intentar eliminar producto CON historial -> debe desactivar lógicamente (PATCH activo=false)
  await page.getByRole("button", { name: `Eliminar ${conHistorial.nombre}` }).click();
  await page.getByRole("button", { name: "Confirmar eliminación" }).click();
  await expect(
    page.getByText(/Se desactivó lógicamente para conservar la trazabilidad/),
  ).toBeVisible();
  expect(methods).toEqual(["PATCH"]);

  // 2. Intentar eliminar producto SIN historial ni existencias -> debe eliminar físicamente (DELETE)
  await page.getByRole("button", { name: `Eliminar ${sinHistorial.nombre}` }).click();
  await page.getByRole("button", { name: "Confirmar eliminación" }).click();
  await expect(
    page.getByText("Producto eliminado permanentemente."),
  ).toBeVisible();
  expect(methods).toEqual(["PATCH", "DELETE"]);
  await expect(
    page.getByRole("link", { name: `Editar ${sinHistorial.nombre}` }),
  ).toHaveCount(0);
});
