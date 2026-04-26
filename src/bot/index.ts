import config from "@/config";
import { Telegraf } from "telegraf";
import setup_commands from "./commands";
import { isEmpty } from "@/utils";

const bot = new Telegraf(config.BOT_TOKEN);

setup_commands(bot);

export const sendMessage = async (
  chatId: string,
  text: string,
  avatarUrl?: string,
) => {
  try {
    const extra = { parse_mode: "HTML" as const };

    if (!isEmpty(avatarUrl)) {
      await bot.telegram.sendPhoto(chatId, avatarUrl, {
        caption: text,
        parse_mode: "HTML",
      });
    } else {
      await bot.telegram.sendMessage(chatId, text, extra);
    }
  } catch (error: any) {
    console.error(`Error sending message to chat ${chatId}`, error.message);
  }
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
