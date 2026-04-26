import config from "@/config";
import { sendMessage } from "@/bot";
import { placeBid } from "@/bidder";
import Job from "@/models/Job";
import { delay } from "@/utils";
import {
  escapeTelegramHtml,
  escapeHref,
  splitTextForTelegram,
} from "@/utils/telegramFormat";
import type { ScrapedJobType } from "@/types/job";

let bidChain: Promise<unknown> = Promise.resolve();

export const scheduleAutoBid = (p: {
  jobid: string;
  groupMessageId?: number;
  channelMessageId?: number;
  job: ScrapedJobType;
}): void => {
  if (!config.AUTO_BID) {
    return;
  }
  bidChain = bidChain
    .then(() => runAutoBid(p))
    .catch((e) => {
      console.error("Auto-bid run failed:", e);
    });
};

const sendSuccessBidToChat = async (
  chatId: string,
  replyTo: number | undefined,
  p: { job: ScrapedJobType; jobid: string; bidText: string; kind: "group" | "channel" },
) => {
  const { job, jobid, bidText, kind } = p;
  const title = job.title || "案件";
  const link = job.url || "";
  const parts = splitTextForTelegram(bidText, 3600);
  const total = parts.length;
  for (let i = 0; i < total; i++) {
    const indexLabel =
      total > 1 ? ` <i>(${i + 1}/${total})</i>` : "";
    let text: string;
    if (kind === "group") {
      if (i === 0) {
        text = `✅ <b>入札が完了しました</b>${indexLabel}\n\n`;
        text += `<b>案件:</b> ${escapeTelegramHtml(title)}\n`;
        text += `<b>ID:</b> <code>${escapeTelegramHtml(jobid)}</code>\n\n`;
        text += `📝 <b>入札文</b>\n\n${escapeTelegramHtml(parts[i]!)}`;
      } else {
        text = `📝 <b>入札文 続き</b>${indexLabel}\n\n${escapeTelegramHtml(
          parts[i]!,
        )}`;
      }
    } else {
      if (i === 0) {
        text = `✅ <b>入札完了</b>${indexLabel} — <b>${escapeTelegramHtml(
          title,
        )}</b>\n`;
        text += link
          ? `🔗 <a href="${escapeHref(link)}">案件ページ</a> · ID <code>${escapeTelegramHtml(
            jobid,
          )}</code>\n\n`
          : `ID <code>${escapeTelegramHtml(jobid)}</code>\n\n`;
        text += `📝 <b>入札文</b>\n\n${escapeTelegramHtml(parts[i]!)}`;
      } else {
        text = `📝 <b>入札文 続き</b>${indexLabel}\n\n${escapeTelegramHtml(
          parts[i]!,
        )}`;
      }
    }
    await sendMessage(chatId, text, {
      replyToMessageId: i === 0 && replyTo != null ? replyTo : undefined,
      linkPreviewOff: true,
    });
    if (i < total - 1) {
      await delay(500);
    }
  }
};

const runAutoBid = async (p: {
  jobid: string;
  groupMessageId?: number;
  channelMessageId?: number;
  job: ScrapedJobType;
}) => {
  const { jobid, groupMessageId, job, channelMessageId } = p;
  console.log(`[AUTO_BID] Starting for job ${jobid}`);

  const result = await placeBid(jobid, {
    descFallback: job.desc || "",
  });

  if (result.ok) {
    await Job.updateOne(
      { id: jobid },
      { $set: { bidPlaced: true, bidText: result.bidText } },
    );

    await sendSuccessBidToChat(
      config.TELEGRAM_DISCUSSION_GROUP_ID,
      groupMessageId,
      {
        job,
        jobid,
        bidText: result.bidText,
        kind: "group",
      },
    );
    await sendSuccessBidToChat(
      config.TELEGRAM_CHANNEL_ID,
      channelMessageId,
      { job, jobid, bidText: result.bidText, kind: "channel" },
    );
  } else {
    const err = (result as { ok: false; error: string }).error;
    await sendMessage(
      config.TELEGRAM_CHANNEL_ID,
      `❌ 自動入札失敗 (ID: <code>${escapeTelegramHtml(jobid)}</code>)\n${escapeTelegramHtml(
        err.slice(0, 2000),
      )}`,
      { replyToMessageId: channelMessageId, linkPreviewOff: true },
    );
    await sendMessage(
      config.TELEGRAM_DISCUSSION_GROUP_ID,
      `❌ 入札失敗: ${escapeTelegramHtml(err.slice(0, 2000))}`,
      groupMessageId != null
        ? { replyToMessageId: groupMessageId, linkPreviewOff: true }
        : { linkPreviewOff: true },
    );
  }
};
