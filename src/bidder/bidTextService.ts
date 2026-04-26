import axios from "axios";
import config from "@/config";
import { DEFAULT_BID_PROMPTS } from "./bidPrompts";

export type BidTextRequest = {
  jobId: string;
  /** ページ／スクレイプ由来の案件説明 */
  description: string;
};

/**
 * テスト用: 定形文（API 不要）。jobId・説明要約を埋めます。
 * 本番: BID_TEXT_MODE=api で external API が返す入札文を使います（入札成功時もその文字列を result に載せる）。
 */
function buildTemplateBidText(req: BidTextRequest): string {
  const shortDesc = (req.description || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  return [
    "拝啓",
    "",
    `本案件（案件ID: ${req.jobId}）の募集内容を拝見し、ぜひご提案の機会をいただきたく、ご連絡申し上げます。`,
    "",
    "（テスト用 テンプレート文です。BID_TEXT_MODE=template 時に利用されます。本番では BID_TEXT_MODE=api と 入札API を接続してください。）",
    "",
    "募集の趣旨に沿って、段階的に要件の整理、実装、調整、納品まで一貫して丁寧に取り組みます。期日や品質面でもご要望に沿えるよう、初期の打ち合わせで認識をすり合わせさせていただきたいです。",
    shortDesc
      ? `\n掲載概要の抜粋: ${shortDesc}\n`
      : "\n",
    "納得いただける成果につながるよう努めてまいります。ご不明点はお気軽にご相談ください。",
    "",
    "今後のご返信、心よりお待ちしております。",
  ].join("\n");
}

/**
 * POST ボディ: 本番の入札文 API へ **jobId** と **prompts**（指示文）を必須で送る。
 * `description` は案件本文（任意; API 側で参照用に使う）。
 * `bidPrompts` は `prompts` と同一内容の互換用エイリアス。
 */
type ApiPayload = {
  jobId: string;
  /** 入札文生成の指示（コードのデフォルト or 環境変数 BID_PROMPTS） */
  prompts: string;
  bidPrompts: string;
  description: string;
};

function parseBidTextFromResponse(data: unknown): string {
  if (data == null) {
    return "";
  }
  if (typeof data === "string" && data.trim().length > 0) {
    return data.trim();
  }
  if (typeof data === "object" && "bidText" in (data as object)) {
    const t = (data as { bidText?: string }).bidText;
    if (typeof t === "string" && t.trim()) {
      return t.trim();
    }
  }
  if (typeof data === "object" && "text" in (data as object)) {
    const t = (data as { text?: string }).text;
    if (typeof t === "string" && t.trim()) {
      return t.trim();
    }
  }
  return "";
}

const getEffectivePrompts = (): string => {
  const fromEnv = (config.BID_PROMPTS || "").trim();
  return fromEnv.length > 0 ? fromEnv : DEFAULT_BID_PROMPTS;
};

async function fetchBidTextFromApi(req: BidTextRequest): Promise<string> {
  if (!config.BID_API_URL) {
    throw new Error("BID_API_URL is not set (BID_TEXT_MODE=api)");
  }

  const prompts = getEffectivePrompts();
  const body: ApiPayload = {
    jobId: req.jobId,
    prompts,
    bidPrompts: prompts,
    description: req.description,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.BID_API_KEY) {
    headers["Authorization"] = `Bearer ${config.BID_API_KEY}`;
  }

  console.log(
    `[BID] POST ${config.BID_API_URL}  jobId=${body.jobId}  prompts.length=${body.prompts.length}  description.length=${body.description.length}`,
  );

  const res = await axios.post<unknown>(config.BID_API_URL, body, {
    headers,
    timeout: config.BID_API_TIMEOUT_MS,
    validateStatus: (s) => s >= 200 && s < 300,
  });

  const text = parseBidTextFromResponse(res.data);
  if (text.length < 10) {
    throw new Error("入札 API の応答に有効な bidText/text が含まれていません");
  }
  return text;
}

/**
 * 入札フォーム用の本文。テンプレート（テスト）または外部 API（本番）。
 * 入札成功後は、ここで採用した `bidText` をそのまま Telegram 通知に使います。
 */
export const resolveBidText = async (req: BidTextRequest): Promise<string> => {
  const mode = (config.BID_TEXT_MODE || "template").toLowerCase();

  if (mode === "api") {
    return fetchBidTextFromApi(req);
  }

  if (mode !== "template") {
    console.warn(
      `[BID] Unknown BID_TEXT_MODE=${mode}, falling back to template`,
    );
  }
  return buildTemplateBidText(req);
};

export { buildTemplateBidText, DEFAULT_BID_PROMPTS, getEffectivePrompts };
