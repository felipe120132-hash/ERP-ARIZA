import { test, expect } from "@playwright/test";
import { mock } from "./fixtures";
test("ruta protegida, login y error de credenciales", async ({ page }) => {
  await mock(page, { session: false });
  await page.goto("/catalogo");
  await expect(page).toHaveURL(/login/);
  await page.screenshot({
    path: "output/frontend/login-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("Correo electrónico").fill("prueba@example.com");
  await page.getByLabel("Contraseña", { exact: true }).fill("incorrecta");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByRole("alert")).toContainText("no son correctos");
});
test("catálogo: búsqueda, filtros, precio, paginación y detalle", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/catalogo");
  await expect(
    page.getByRole("heading", { name: "Todo listo para vender." }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(12);
  await page.screenshot({
    path: "output/frontend/catalogo-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Página siguiente" }).click();
  await expect(page.getByRole("article")).toHaveCount(2);
  await page.getByLabel("Buscar producto o SKU").fill("cafe");
  await expect(page.getByRole("article")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Ver detalle de Café de origen" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Tasa de IVA");
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.getByLabel("Tipo de precio").click();
  await page.getByRole("option", { name: "Distribuidor", exact: true }).click();
  await expect(page.getByRole("article")).toContainText("16.000");
  await page.getByRole("button", { name: "Limpiar filtros" }).click();
  await expect(page.getByLabel("Buscar producto o SKU")).toHaveValue("");
  await expect(page.getByRole("article")).toHaveCount(12);
  await page.getByLabel("Categoría", { exact: true }).click();
  await page.getByRole("option", { name: "Alimentos", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(7);
  await page.reload();
  await expect(page.getByRole("article")).toHaveCount(7);
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/login/);
});
test("vendedor: navegación móvil y acceso financiero", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page, { role: "VENDEDOR" });
  await page.goto("/catalogo");
  await expect(page.getByRole("article")).toHaveCount(12);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "output/frontend/catalogo-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Finanzas y gastos" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Cartera y clientes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/finanzas");
  await expect(
    page.getByRole("heading", { name: "Acceso restringido" }),
  ).toBeVisible();
});
test("menús, desplegables y zoom del navegador (100% a 200%)", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/catalogo");

  const zoomScenarios = [
    { label: "100%", width: 1440, height: 900, zoom: 1 },
    { label: "125%", width: 1152, height: 720, zoom: 1.25 },
    { label: "150%", width: 960, height: 600, zoom: 1.5 },
    { label: "175%", width: 820, height: 480, zoom: 1.75 },
  ];

  for (const scenario of zoomScenarios) {
    await page.setViewportSize({
      width: scenario.width,
      height: scenario.height,
    });
    await page.evaluate((z) => {
      document.documentElement.style.zoom = String(z);
    }, scenario.zoom);

    const sidebar = page.locator(".desktop-sidebar");
    await expect(sidebar).toBeVisible();

    const expectedLinks = [
      "Resumen",
      "Catálogo",
      "Remisiones",
      "Inventario",
      "Cartera y clientes",
      "Finanzas y gastos",
      "Documentos",
    ];
    for (const label of expectedLinks) {
      const link = sidebar.getByRole("link", { name: label });
      await link.scrollIntoViewIfNeeded();
      await expect(link).toBeVisible();
    }

    const logoutBtn = sidebar.getByRole("button", { name: "Cerrar sesión" });
    await logoutBtn.scrollIntoViewIfNeeded();
    await expect(logoutBtn).toBeVisible();

    const collapseBtn = sidebar.getByRole("button", { name: "Contraer menú" });
    await collapseBtn.scrollIntoViewIfNeeded();
    await expect(collapseBtn).toBeVisible();

    await page.evaluate(() => {
      document.documentElement.style.zoom = "1";
    });
    await page.getByLabel("Categoría", { exact: true }).click();
    const listbox = page.getByRole("listbox");
    await expect(listbox).toBeVisible();
    const box = await listbox.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(scenario.width + 2);
      expect(box.y + box.height).toBeLessThanOrEqual(scenario.height + 2);
    }
    await page
      .getByRole("option", { name: "Todas las categorías", exact: true })
      .click();
  }
});
test("navegación móvil: contraste, perfil, cierre de sesión, contraer menú y orientaciones", async ({
  page,
}) => {
  const viewports = [
    { name: "mobile-small-portrait", width: 320, height: 568 },
    { name: "mobile-standard-portrait", width: 390, height: 844 },
    { name: "mobile-landscape", width: 667, height: 375 },
    { name: "tablet-portrait", width: 768, height: 1024 },
  ];

  await mock(page);
  await page.goto("/catalogo");

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });

    if (vp.width <= 760) {
      await page.getByRole("button", { name: "Abrir menú" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      const styles = await dialog.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        const firstLink = el.querySelector(".nav-item");
        const linkComputed = firstLink
          ? window.getComputedStyle(firstLink)
          : null;
        return {
          backgroundImage: computed.backgroundImage,
          backgroundColor: computed.backgroundColor,
          color: computed.color,
          linkColor: linkComputed?.color ?? "",
        };
      });
      expect(styles.backgroundImage).toContain("linear-gradient");
      expect(styles.backgroundColor).not.toBe("rgb(239, 242, 246)");
      expect(styles.color).toBe("rgb(255, 255, 255)");

      const logoutButton = dialog.getByRole("button", {
        name: "Cerrar sesión",
      });
      await logoutButton.scrollIntoViewIfNeeded();
      await expect(logoutButton).toBeVisible();

      const collapseButton = dialog.getByRole("button", {
        name: "Contraer menú",
      });
      await collapseButton.scrollIntoViewIfNeeded();
      await expect(collapseButton).toBeVisible();
      await collapseButton.click();
      await expect(dialog).toHaveCount(0);
    } else {
      await expect(page.locator(".desktop-sidebar")).toBeVisible();
    }
  }
});
test("perfil inactivo no entra al catálogo", async ({ page }) => {
  await mock(page, { active: false });
  await page.goto("/catalogo");
  await expect(page.getByRole("alert")).toContainText("desactivada");
  await expect(page.getByRole("article")).toHaveCount(0);
});
test("error de catálogo permite reintento", async ({ page }) => {
  await mock(page, { error: true });
  await page.goto("/catalogo");
  await expect(
    page.getByRole("heading", { name: "No pudimos cargar el catálogo" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Volver a intentar" }),
  ).toBeVisible();
});
