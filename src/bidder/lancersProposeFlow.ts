import { type Page } from "playwright";
import { delay } from "@/utils";

const MAX_ESTIMATE_LEN = 2000;
const MAX_DESCRIPTION_LEN = 3000;

export const proposeStartUrl = (jobId: string) =>
  `https://www.lancers.jp/work/propose_start/${jobId}?proposeReferer=`;

const agreeNda = async (page: Page) => {
  const preview = page.locator("a.js-work-contract-preview").first();
  if (await preview.isVisible().catch(() => false)) {
    await preview.click();
    await delay(2000);
  }
  const cb = page.locator("#ProposalIsAgreement");
  await cb.waitFor({ state: "visible", timeout: 20000 });
  await page.evaluate(() => {
    const el = document.querySelector<HTMLInputElement>("#ProposalIsAgreement");
    if (el) {
      el.removeAttribute("disabled");
      el.classList.remove("disabled");
    }
  });
  if (!(await cb.isChecked().catch(() => false))) {
    await cb.check({ force: true });
  }
  await delay(200);
};

const fillVisibleProposalOptionsIfNeeded = async (page: Page) => {
  const minAmount = 1000;
  for (let idx = 0; idx < 10; idx++) {
    const title = page.locator(`#ProposalOption${idx}Title`);
    if (!(await title.isVisible().catch(() => false))) {
      continue;
    }
    const t = (await title.inputValue().catch(() => "")) || "";
    if (!t.trim()) {
      await title.fill("ご依頼内容に合わせたオプション");
    }
    const desc = page.locator(`#ProposalOption${idx}Description`);
    if (await desc.isVisible().catch(() => false)) {
      const d = (await desc.inputValue().catch(() => "")) || "";
      if (!d.trim()) {
        await desc.fill("ご要望に応じて柔軟に対応します。");
      }
    }
    const amt = page.locator(`#ProposalOption${idx}contractAmount`);
    if (await amt.isVisible().catch(() => false)) {
      const a = (await amt.inputValue().catch(() => "")) || "";
      if (!a.trim()) {
        await amt.fill(String(minAmount));
      }
    }
  }
};

const waitMilestoneReady = async (page: Page) => {
  if (await page.locator("#FeeApp, .js-fee-root").count()) {
    await page
      .locator("#FeeApp, .js-fee-root")
      .first()
      .waitFor({ state: "visible", timeout: 20000 });
    await delay(3000);
  } else {
    await delay(2000);
  }
};

const clickConfirmForReview = async (page: Page) => {
  const primary = page.locator(
    'input[type="submit"]#form_end[name="send"][value="内容を確認する"]',
  );
  if ((await primary.count()) > 0) {
    await primary.first().click();
    return;
  }
  const alt = page.locator('input[type="submit"][value="内容を確認する"]');
  if ((await alt.count()) > 0) {
    await alt.first().click();
    return;
  }
  throw new Error("「内容を確認する」ボタンが見つかりません");
};

const clickFinalSubmit = async (page: Page) => {
  const primary = page.locator(
    'input[type="submit"]#form_end[name="send"][value="利用規約に同意して提案する"]',
  );
  if ((await primary.count()) > 0) {
    await primary.first().click();
    return;
  }
  const alt = page.locator('input[type="submit"][value="利用規約に同意して提案する"]');
  if ((await alt.count()) > 0) {
    await alt.first().click();
    return;
  }
  throw new Error("「利用規約に同意して提案する」ボタンが見つかりません");
};

/**
 * セッション済みブラウザで propose_start → 確認 → propose_confirm → 送信
 */
export const runFullProposeFlow = async (
  page: Page,
  jobId: string,
  bidText: string,
): Promise<void> => {
  const start = proposeStartUrl(jobId);
  await page.goto(start, { waitUntil: "domcontentloaded", timeout: 120000 });
  if (page.url().includes("user/login")) {
    throw new Error("提案画面が開けずログインへ戻りました (セッション切れ等)");
  }

  await page.waitForSelector(
    "article.c-form__main, #ProposalDescription, #ProposalEstimate",
    { timeout: 30000 },
  );
  await agreeNda(page);

  const t = bidText.replace(/\s+/g, " ").trim();
  /** 長文は 企画(2000) + 本文(直後 3000) に連結して掲載（重複を避ける） */
  if (t.length <= MAX_ESTIMATE_LEN) {
    await page.locator("#ProposalEstimate").waitFor({ state: "visible", timeout: 20000 });
    await page.locator("#ProposalEstimate").fill(t);
    await page.locator("#ProposalDescription").waitFor({ state: "visible", timeout: 20000 });
    await page.locator("#ProposalDescription").fill(t);
  } else {
    const est = t.slice(0, MAX_ESTIMATE_LEN);
    const desc = t.slice(
      MAX_ESTIMATE_LEN,
      MAX_ESTIMATE_LEN + MAX_DESCRIPTION_LEN,
    );
    await page.locator("#ProposalEstimate").waitFor({ state: "visible", timeout: 20000 });
    await page.locator("#ProposalEstimate").fill(est);
    await page.locator("#ProposalDescription").waitFor({ state: "visible", timeout: 20000 });
    await page
      .locator("#ProposalDescription")
      .fill(
        desc ||
          "（上記 企画に記載。続きは掲載文字数内に収まりました。）",
      );
  }

  await waitMilestoneReady(page);
  await fillVisibleProposalOptionsIfNeeded(page);
  await clickConfirmForReview(page);

  await page.waitForURL("**/propose_confirm/**", {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.waitForLoadState("domcontentloaded", { timeout: 120000 });
  await delay(1500);

  await clickFinalSubmit(page);
  await page.waitForLoadState("domcontentloaded", { timeout: 120000 });
  await delay(2000);
};

export const assertNoProposeFormStillOpen = (url: string) => {
  if (url.includes("propose_start") || url.includes("propose_confirm")) {
    throw new Error("入札完了を確認できません (まだ提出画面/確認画面のまま)" + ` URL: ${url}`);
  }
  const hasErr = url.includes("error") && url.includes("lancers");
  if (hasErr) {
    throw new Error("遷移先がエラーの可能性: " + url);
  }
};
