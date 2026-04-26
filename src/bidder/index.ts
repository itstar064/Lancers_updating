import config from "@/config";
import { chromium, type Page } from "playwright";
import { resolveBidText } from "./bidTextService";
import {
  runFullProposeFlow,
  assertNoProposeFormStillOpen,
} from "./lancersProposeFlow";

export type PlaceBidResult =
  | { ok: true; bidText: string }
  | { ok: false; error: string };

/**
 * Lancers: ログイン後 `propose_start` → 入力 → 内容確認 → `propose_confirm` → 利用規約同意で入札
 */
const loginIfNeeded = async (page: Page): Promise<{ error: string } | null> => {
  await page.goto("https://www.lancers.jp/user/login", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  if (page.url().includes("/mypage")) {
    return null;
  }

  await page.waitForSelector("#login_form, form#login_form", { timeout: 20000 });
  await page.waitForSelector("#UserEmail", { timeout: 15000 });
  await page.waitForSelector("#UserPassword", { timeout: 15000 });
  await page.waitForSelector("#form_submit", { timeout: 15000 });

  await page.fill("#UserEmail", "");
  await page.type("#UserEmail", config.EMAIL, { delay: 25 });
  await page.fill("#UserPassword", "");
  await page.type("#UserPassword", config.PASSWORD, { delay: 25 });

  await page.click("#form_submit");
  await page.waitForLoadState("domcontentloaded", { timeout: 30000 });

  if (page.url().includes("/verify_code")) {
    return {
      error: "verify_code: 2FA/認証が必要 — 手動でセッションを通してください",
    };
  }

  try {
    await page.waitForURL("**/mypage**", { timeout: 120000 });
  } catch {
    if (page.url().includes("login")) {
      return { error: "mypage に到達できずログイン失敗" };
    }
  }
  return null;
};

export const placeBid = async (
  jobid: string,
  options?: { descFallback?: string },
): Promise<PlaceBidResult> => {
  const descFallback = (options?.descFallback || "").replace(/\s+/g, " ").trim();
  const description =
    descFallback.length >= 5
      ? descFallback
      : "案件の概要は掲載ページに準じ、丁寧に対応いたします。詳細はご依頼後にすり合わせさせてください。";

  let bidText: string;
  try {
    bidText = await resolveBidText({ jobId: jobid, description });
  } catch (e) {
    const m = (e as Error).message || String(e);
    return { ok: false, error: `入札文の取得に失敗: ${m}` };
  }
  if (!bidText || bidText.length < 10) {
    return { ok: false, error: "入札文の生成に失敗" };
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    const loginErr = await loginIfNeeded(page);
    if (loginErr) {
      return { ok: false, error: loginErr.error };
    }

    await runFullProposeFlow(page, jobid, bidText);
    const finalUrl = page.url();
    assertNoProposeFormStillOpen(finalUrl);
    return { ok: true, bidText };
  } catch (e) {
    const err = (e as Error).message || String(e);
    console.error("placeBid error:", err);
    return { ok: false, error: err };
  } finally {
    await browser.close().catch(() => {});
  }
};
