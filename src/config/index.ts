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
const AUTO_BID =
  (process.env.AUTO_BID || "").toLowerCase() === "true" ||
  process.env.AUTO_BID === "1";
const OPENAI = process.env.OPENAI_API;

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
if (!OPENAI) {
  console.error("Missing OPENAI");
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
  OPENAI_API: string;
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
  OPENAI_API: OPENAI!,
  PROXY: process.env.PROXY,
  PROXY_AUTH: process.env.PROXY_AUTH
    ? JSON.parse(process.env.PROXY_AUTH)
    : undefined,
};

export default config;
