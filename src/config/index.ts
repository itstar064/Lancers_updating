import { configDotenv } from "dotenv";

configDotenv();

const PORT = process.env.PORT || "5000";
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;
const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;
const ADMIN_ID = process.env.ADMIN_ID;
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;
const TELEGRAM_DISCUSSION_GROUP_ID = process.env.TELEGRAM_DISCUSSION_GROUP_ID;
const TELEGRAM_ADMIN_USER_ID = process.env.TELEGRAM_ADMIN_USER_ID;
/** 新規案件の自動入札。未設定なら有効。無効: AUTO_BID=false|0|no|off */
const _auto = (process.env.AUTO_BID || "").toLowerCase().trim();
const AUTO_BID = _auto === "" ? true : !["false", "0", "no", "off"].includes(_auto);
const BID_TEXT_MODE = (process.env.BID_TEXT_MODE || "template").toLowerCase();
const BID_API_URL = process.env.BID_API_URL;
const BID_API_KEY = process.env.BID_API_KEY;
const BID_API_TIMEOUT_MS = Number(
  process.env.BID_API_TIMEOUT_MS || 120_000,
);
/** Overrides `DEFAULT_BID_PROMPTS` from `bidPrompts.ts` when set. */
const BID_PROMPTS = process.env.BID_PROMPTS;

let config_missing = false;

if (!BOT_TOKEN) {
  console.error("Missing BOT_TOKEN");
  config_missing = true;
}

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI");
  config_missing = true;
}

if (!EMAIL) {
  console.error("Missing EMAIL");
  config_missing = true;
}

if (!PASSWORD) {
  console.error("Missing PASSWORD");
  config_missing = true;
}

if (!ADMIN_ID) {
  console.error("Missing ADMIN_ID");
  config_missing = true;
}
if (BID_TEXT_MODE === "api" && !BID_API_URL) {
  console.error("BID_TEXT_MODE=api requires BID_API_URL");
  config_missing = true;
}

if (!TELEGRAM_CHANNEL_ID) {
  console.error("Missing TELEGRAM_CHANNEL_ID (scrape + bid notices)");
  config_missing = true;
}

if (!TELEGRAM_DISCUSSION_GROUP_ID) {
  console.error(
    "Missing TELEGRAM_DISCUSSION_GROUP_ID (project cards + bid replies in group)",
  );
  config_missing = true;
}

if (config_missing) {
  process.exit(1);
}

interface Config {
  PORT: number;
  BOT_TOKEN: string;
  MONGODB_URI: string;
  EMAIL: string;
  PASSWORD: string;
  ADMIN_ID: string;
  TELEGRAM_CHANNEL_ID: string;
  TELEGRAM_DISCUSSION_GROUP_ID: string;
  /** Telegram numeric user id for /start_scraping, etc. Falls back to ADMIN_ID if unset. */
  TELEGRAM_ADMIN_USER_ID: string | undefined;
  AUTO_BID: boolean;
  /** "template" (test, no LLM) or "api" (BID_API_URL) */
  BID_TEXT_MODE: string;
  BID_API_URL: string | undefined;
  BID_API_KEY: string | undefined;
  BID_API_TIMEOUT_MS: number;
  /** Custom 入札指示文; if empty, `bidPrompts.ts` default is used. */
  BID_PROMPTS: string | undefined;
  PROXY: string | undefined;
  PROXY_AUTH: { username: string; password: string } | undefined;
}

const config: Config = {
  PORT: Number(PORT),
  BOT_TOKEN: BOT_TOKEN!,
  MONGODB_URI: MONGODB_URI!,
  EMAIL: EMAIL!,
  PASSWORD: PASSWORD!,
  ADMIN_ID: ADMIN_ID!,
  TELEGRAM_CHANNEL_ID: TELEGRAM_CHANNEL_ID!,
  TELEGRAM_DISCUSSION_GROUP_ID: TELEGRAM_DISCUSSION_GROUP_ID!,
  TELEGRAM_ADMIN_USER_ID: TELEGRAM_ADMIN_USER_ID,
  AUTO_BID,
  BID_TEXT_MODE,
  BID_API_URL: BID_API_URL || undefined,
  BID_API_KEY: BID_API_KEY || undefined,
  BID_API_TIMEOUT_MS,
  BID_PROMPTS: BID_PROMPTS || undefined,
  PROXY: process.env.PROXY,
  PROXY_AUTH: process.env.PROXY_AUTH
    ? JSON.parse(process.env.PROXY_AUTH)
    : undefined,
};

export default config;
