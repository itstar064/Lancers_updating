import config from "@/config";
import { Telegraf } from "telegraf";
import setup_commands from "./commands";
import { isEmpty } from "@/utils";

const bot = new Telegraf(config.BOT_TOKEN);

setup_commands(bot);

export type SendMessageOptions = {
  avatarUrl?: string;
  replyToMessageId?: number;
  linkPreviewOff?: boolean;
};

const normalizeOptions = (third?: string | SendMessageOptions): SendMessageOptions => {
  if (typeof third === "string") {
    return { avatarUrl: third };
  }
  return third ?? {};
};

/**
 * @param third Legacy: `avatarUrl` string, or `SendMessageOptions` for reply, etc.
 * @returns The sent `Message` or `undefined` on failure.
 */
export const sendMessage = async (
  chatId: string,
  text: string,
  third?: string | SendMessageOptions,
): Promise<unknown> => {
  const opts = normalizeOptions(third);
  const { avatarUrl, replyToMessageId, linkPreviewOff = false } = opts;
  try {
    const common: Record<string, unknown> = { parse_mode: "HTML" as const };
    if (linkPreviewOff) {
      (common as { link_preview_options: { is_disabled: boolean } }).link_preview_options =
        { is_disabled: true };
    }
    if (replyToMessageId != null) {
      (common as { reply_to_message_id: number }).reply_to_message_id =
        replyToMessageId;
    }

    if (!isEmpty(avatarUrl)) {
      return await bot.telegram.sendPhoto(chatId, { url: avatarUrl }, {
        caption: text,
        parse_mode: "HTML",
        ...common,
      });
    }
    return await bot.telegram.sendMessage(chatId, text, { ...common });
  } catch (error: any) {
    console.error(`Error sending message to chat ${chatId}`, error.message);
  }
  return undefined;
};

export const launchBot = async () => {
  try {
    return await new Promise((resolve) => {
      bot.launch(() => {
        resolve("Bot started");
      });
    });
  } catch (error: any) {
    console.error("Error launching bot:", error.message);
    throw error;
  }
};
