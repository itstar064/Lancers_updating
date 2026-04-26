import config from "@/config";
import { delay } from "@/utils";
import { chromium, type Page } from "playwright";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat";

const basicUrl = "https://www.lancers.jp/proposals/new?job_offer_id=";
const openai = new OpenAI({
  apiKey: config.OPENAI_API,
});

const systemPrompt = `求人広告の入札文を作成する際は、できる限り最適なバージョンを作成するようにしてください。ロボット的だったり、過度に売り込みがちになったりせず、人間的で自然なトーンでなければなりません。専門用語は必要に応じて使用しつつも、メッセージは会話調にしてください。

入札文にはダッシュを使用せず、自然でリアルなトーン、つまり無駄な言葉や過度に甲高い言葉遣いは避けてください。入札文は、ネイティブの日本人が話しているように聞こえるものでなければなりません。

入札文は、親しみやすい挨拶で始めましょう。

入札文の構成は以下のとおりです。

* まず、タスクまたはプロジェクトを明確に理解していることを示します。
* 次に、仕事に関連する私の経験について説明します。
* その後、タスクにどのようにアプローチし、どのように処理していくかを段階的に説明します。
* 次に、プロジェクトに関する個人的な推奨事項や洞察を追加します。
* 最後に、プロジェクトを完全に処理できると自信を持って述べます。

最後に、「ご連絡をお待ちしております」「ありがとうございます」「さらに詳しくお話しするために、お話しさせていただければ幸いです」などの言葉で締めくくります。

入札では箇条書きやダッシュを使用しないでください。段落形式で記入してください。`;

export type PlaceBidResult =
  | { ok: true; bidText: string }
  | { ok: false; error: string };

const generateBidText = async (description: string) => {
  const message = `この仕事に入札するためのテキストを作成してください。そうすれば、それを利用することができます。入札テキストのみを返信し、他のテキストは含めないでください。\n\n${description}`;
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: message },
  ];

  const completion = await openai.chat.completions.create({
    messages,
    model: "gpt-4o",
    max_tokens: 2000,
  });

  return (completion.choices[0].message.content || "").replace(/"/g, "");
};

/**
 * Lancers: login, open proposal form, fill OpenAI 入札文, submit (headless).
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
      error: "verify_code: 2FA/認証が必要 — headless では手動ログインが必要な場合があります",
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

const readJobDescription = async (page: Page, descFallback: string) => {
  const selectors = [
    ".c-work-detail__content",
    ".c-article__body",
    "article .c-media__text",
    ".l-js-project-detail",
    ".description",
    "main",
  ];
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) {
      const text = (await el.textContent()) || "";
      const t = text.replace(/\s+/g, " ").trim();
      if (t.length > 30) {
        return t;
      }
    }
  }
  return descFallback;
};

const fillProposalAndSubmit = async (page: Page, bidText: string) => {
  const withoutCondition = page.locator(
    'input[type="radio"][name="without_condition"][value="true"]',
  );
  if (await withoutCondition.count()) {
    await withoutCondition.first().check({ timeout: 10000 });
  } else {
    const alt = page.locator("input[name='without_condition']").first();
    if (await alt.count()) {
      await alt.check({ timeout: 10000 });
    }
  }

  await delay(200);

  const textAreas = page.locator("textarea");
  const n = await textAreas.count();
  if (n === 0) {
    throw new Error("入力欄 (textarea) が見つかりません");
  }

  let filled = false;
  let lastErr: Error | null = null;
  for (let i = 0; i < n; i++) {
    const ta = textAreas.nth(i);
    if (!(await ta.isVisible().catch(() => false))) {
      continue;
    }
    try {
      await ta.fill(bidText, { timeout: 15000 });
      filled = true;
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e as Error;
    }
  }
  if (!filled) {
    throw lastErr || new Error("textarea への入力に失敗");
  }

  const submit = page
    .locator('input[type="submit"][name="commit"]')
    .or(page.locator('button[type="submit"]'));
  if ((await submit.count()) === 0) {
    throw new Error("送信ボタンが見つかりません");
  }
  await submit.first().click();
  await page.waitForLoadState("domcontentloaded", { timeout: 120000 });
  await delay(2000);

  const u = page.url();
  if (u.includes("proposals/new") && u.includes("job_offer_id")) {
    const err = await page
      .locator(".c-alert, .c-error, .is-error, .alert, [class*='error']")
      .first();
    if (await err.isVisible().catch(() => false)) {
      const msg = (await err.textContent()) || "ページにエラー表示";
      throw new Error(msg);
    }
    throw new Error("入札完了を確認できません (URL が提案ページのまま)");
  }
};

export const placeBid = async (
  jobid: string,
  options?: { descFallback?: string },
): Promise<PlaceBidResult> => {
  const descFallback = options?.descFallback || "";
  const jobUrl = `${basicUrl}${jobid}`;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    const loginErr = await loginIfNeeded(page);
    if (loginErr) {
      return { ok: false, error: loginErr.error };
    }

    await page.goto(jobUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
    if (page.url().includes("user/login")) {
      return { ok: false, error: "提案ページが開けずログインに戻りました" };
    }

    const description = await readJobDescription(page, descFallback);
    if (!description || description.length < 5) {
      return { ok: false, error: "案件の説明テキストを取得できません" };
    }

    const bidText = await generateBidText(description);
    if (!bidText || bidText.length < 10) {
      return { ok: false, error: "入札文の生成に失敗" };
    }

    await fillProposalAndSubmit(page, bidText);
    return { ok: true, bidText };
  } catch (e) {
    const err = (e as Error).message || String(e);
    console.error("placeBid error:", err);
    return { ok: false, error: err };
  } finally {
    await browser.close().catch(() => {});
  }
};
