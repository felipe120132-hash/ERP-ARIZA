import { test, expect, type Page } from "@playwright/test";
import { mock, api, id } from "./fixtures";
const state = "a".repeat(64);
const redirectUri = "http://127.0.0.1:5174/onedrive/callback";
async function pending(page: Page, overrides = {}) {
  await page.addInitScript(value => {
    if (!sessionStorage.getItem("seeded")) {
      sessionStorage.setItem("ariza:onedrive:pending", JSON.stringify(value));
      sessionStorage.setItem("seeded", "yes");
    }
  }, { state, userId: id, createdAt: Date.now(), redirectUri, ...overrides });
}
test("intercambia una sola vez, limpia URL y permite desconectar", async ({ page }) => {
  await mock(page); await pending(page);
  let calls = 0;
  await page.route(`${api}/functions/v1/onedrive-auth`, async route => {
    calls++;
    expect(route.request().postDataJSON()).toEqual({ code: "test-code", redirect_uri: redirectUri });
    expect(route.request().headers().authorization).toBe("Bearer test-token");
    await route.fulfill({ json: { access_token: "ms-access", refresh_token: "ms-refresh", expires_in: 3600, token_type: "Bearer" } });
  });
  await page.goto(`/onedrive/callback?code=test-code&state=${state}`);
  await expect(page.getByRole("heading", { name: "Conexión completada" })).toBeVisible();
  expect(page.url()).toBe(redirectUri); expect(calls).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem("onedrive_access_token"))).toBeNull();
  await page.getByRole("link", { name: "Volver a Documentos" }).click();
  await expect(page.getByRole("heading", { name: "OneDrive conectado en esta pestaña" })).toBeVisible();
  await page.getByRole("button", { name: "Desconectar OneDrive" }).click();
  expect(await page.evaluate(key => sessionStorage.getItem(key), `ariza:onedrive:${id}`)).toBeNull();
});
for (const scenario of ["state", "expired", "owner", "missing", "cancel", "no-session", "inactive"]) {
  test(`rechaza ${scenario} sin intercambiar código`, async ({ page }) => {
    await mock(page, { session: scenario !== "no-session", active: scenario !== "inactive" });
    if (scenario !== "missing") await pending(page, scenario === "expired" ? { createdAt: Date.now() - 700000 } : scenario === "owner" ? { userId: "otro" } : {});
    let calls = 0;
    await page.route(`${api}/functions/v1/onedrive-auth`, async route => { calls++; await route.abort(); });
    await page.goto(`/onedrive/callback?${scenario === "cancel" ? "error=access_denied" : "code=test-code"}&state=${scenario === "state" ? "bad" : state}`);
    await expect(page.getByRole("alert")).toBeVisible();
    expect(calls).toBe(0); expect(page.url()).toBe(redirectUri);
  });
}
for (const failure of ["network", "invalid-response"]) {
  test(`${failure}: no reenvía el código al recargar`, async ({ page }) => {
    await mock(page); await pending(page); let calls = 0;
    await page.route(`${api}/functions/v1/onedrive-auth`, async route => { calls++; if (failure === "network") await route.abort(); else await route.fulfill({ json: { access_token: "incomplete" } }); });
    await page.goto(`/onedrive/callback?code=test-code&state=${state}`);
    await expect(page.getByRole("alert")).toBeVisible();
    await page.reload(); await expect(page.getByRole("alert")).toBeVisible();
    expect(calls).toBe(1);
    expect(await page.evaluate(key => sessionStorage.getItem(key), `ariza:onedrive:${id}`)).toBeNull();
  });
}
test("inicia autorización con state aleatorio y retorno correcto", async ({ page }) => {
  await mock(page);
  let target = "";
  await page.route("https://login.microsoftonline.com/**", async route => { target = route.request().url(); await route.fulfill({ contentType: "text/html", body: "Microsoft simulado" }); });
  await page.goto("/documentos"); await page.getByRole("button", { name: "Conectar OneDrive" }).click();
  await expect.poll(() => target).not.toBe("");
  const params = new URL(target).searchParams;
  expect(params.get("state")).toMatch(/^[a-f0-9]{64}$/);
  expect(params.get("redirect_uri")).toBe(redirectUri);
});
