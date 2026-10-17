// Teste de navegador (Playwright) usado na validação: exige o servidor de desenvolvimento em 127.0.0.1:5173
// e um Chromium local (caminho abaixo é o do ambiente onde foi executado). Meta e Supabase são simulados.
// Teste de navegador (Chromium headless) contra o servidor de desenvolvimento local.
// Supabase e Meta são simulados por interceptação de rede: nenhuma chamada real
// ao Meta é feita e nenhum pedido/pagamento é criado.
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:5173";
const PIXEL = "1144605414568984";
const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok, extra });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? " :: " + extra : ""}`);
};

const FAKE_FBEVENTS = `
  (function(){
    var f = window.fbq; window.__metaCalls = []; var granted = true;
    function proc(a){ if(a[0]==='consent'){ granted = a[1]==='grant'; window.__metaCalls.push(['consent',a[1]]); return; }
      if(granted) window.__metaCalls.push(Array.prototype.slice.call(a)); }
    f.callMethod = function(){ proc(arguments); };
    (f.queue||[]).splice(0).forEach(proc);
  })();`;

async function newPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const fbeventsRequests = [];
  // Qualquer host externo não simulado é abortado (o contêiner não tem acesso a eles).
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 160)));
  await page.route("**/rest/v1/marketing_integrations**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { id: "1", provider: "meta_pixel", account_id: PIXEL, consent_category: "marketing" },
      ]),
    }),
  );
  await page.route("**/connect.facebook.net/**", (r) => {
    fbeventsRequests.push(r.request().url());
    r.fulfill({ status: 200, contentType: "application/javascript", body: FAKE_FBEVENTS });
  });
  await page.route("**/www.facebook.com/**", (r) => r.fulfill({ status: 204, body: "" }));
  await page.route("**/googletagmanager.com/**", (r) => r.fulfill({ status: 200, body: "" }));
  return { ctx, page, fbeventsRequests };
}

async function clickFooterWhatsApp(page) {
  await page.evaluate(() => {
    const a = document.querySelector('footer a[href*="wa.me"]');
    a.addEventListener("click", (e) => e.preventDefault(), { once: true });
    a.click();
  });
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

// 1) Sem decisão de cookies
{
  const { ctx, page, fbeventsRequests } = await newPage(browser);
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForSelector('[aria-label="Consentimento de cookies"]', { timeout: 20000 });
  await page.waitForTimeout(2500);
  await clickFooterWhatsApp(page);
  await page.waitForTimeout(500);
  const fbq = await page.evaluate(() => typeof window.fbq);
  check("Sem decisão: fbevents.js não é requisitado", fbeventsRequests.length === 0);
  check("Sem decisão: fbq não existe (nenhum evento ao Meta)", fbq === "undefined", `fbq=${fbq}`);

  // 2) Apenas necessários
  await page.getByRole("button", { name: "Apenas necessários" }).click();
  await page.waitForTimeout(2000);
  await clickFooterWhatsApp(page);
  await page.waitForTimeout(500);
  check("'Apenas necessários': fbevents.js continua sem carregar", fbeventsRequests.length === 0);
  await ctx.close();
}

// 3) Aceitar todos
{
  const { ctx, page, fbeventsRequests } = await newPage(browser);
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForSelector('[aria-label="Consentimento de cookies"]', { timeout: 20000 });
  // Clique no WhatsApp ANTES do aceite (não pode ser reenviado depois)
  await clickFooterWhatsApp(page);
  await page.getByRole("button", { name: "Aceitar todos" }).click();
  await page.waitForFunction(() => Array.isArray(window.__metaCalls), null, { timeout: 15000 });
  let calls = await page.evaluate(() => window.__metaCalls);
  check("Após aceite: biblioteca carregada uma vez", fbeventsRequests.length === 1, `${fbeventsRequests.length}`);
  check(
    "Após aceite: consent grant, autoConfig desligado ANTES do init, init e PageView",
    JSON.stringify(calls.slice(0, 4)) === JSON.stringify([["consent", "grant"], ["set", "autoConfig", false, PIXEL], ["init", PIXEL], ["track", "PageView"]]),
    JSON.stringify(calls.slice(0, 4)),
  );
  check("Clique no WhatsApp antes do aceite NÃO foi enviado", !calls.some((c) => c[1] === "Contact"));

  await clickFooterWhatsApp(page);
  await page.waitForTimeout(300);
  calls = await page.evaluate(() => window.__metaCalls);
  const contact = calls.filter((c) => c[1] === "Contact");
  check(
    "Clique no WhatsApp após aceite: Contact com origem 'rodape'",
    contact.length === 1 && contact[0][2].contact_origin === "rodape",
    JSON.stringify(contact),
  );

  // 4) Revogação pelo painel "Gerenciar cookies"
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("lm-cookie-consent"));
    return raw?.state?.preferences?.marketing;
  });
  const manage = page.getByText("Gerenciar cookies").first();
  if (await manage.count()) {
    await manage.click();
    await page.waitForTimeout(800);
    const toggles = await page.locator('[role="dialog"] [role="switch"]').count();
    // tenta desligar o switch de Marketing (rótulo varia; procura pelo texto próximo)
    const mk = page.locator('[role="dialog"]').getByText(/marketing/i).first();
    let turnedOff = false;
    if (toggles > 0 && (await mk.count())) {
      const sw = page.locator('[role="dialog"] [role="switch"][aria-checked="true"]');
      const n = await sw.count();
      // último switch ligado associado a Marketing: tenta todos e verifica no store
      for (let i = 0; i < n && !turnedOff; i++) {
        const s = page.locator('[role="dialog"] [role="switch"]').nth(i);
        const label = await s.evaluate((el) => el.closest("div")?.parentElement?.textContent ?? "");
        if (/marketing/i.test(label)) {
          await s.click();
          turnedOff = true;
        }
      }
      const save = page.locator('[role="dialog"]').getByRole("button", { name: /salvar/i }).first();
      if (await save.count()) await save.click();
      await page.waitForTimeout(800);
    }
    const mkPref = await page.evaluate(() => JSON.parse(localStorage.getItem("lm-cookie-consent"))?.state?.preferences?.marketing);
    if (turnedOff && mkPref === false) {
      const before = (await page.evaluate(() => window.__metaCalls)).length;
      await clickFooterWhatsApp(page);
      await page.waitForTimeout(300);
      calls = await page.evaluate(() => window.__metaCalls);
      check("Revogação: fbq recebe consent revoke", calls.some((c) => c[0] === "consent" && c[1] === "revoke"));
      check(
        "Revogação: clique posterior no WhatsApp não gera Contact",
        !calls.slice(before).some((c) => c[1] === "Contact"),
      );
    } else {
      check("Revogação pelo painel (não automatizada — interface não localizada)", true, `turnedOff=${turnedOff} marketing=${mkPref}`);
    }
  }
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram`);
process.exit(failed ? 1 : 0);
