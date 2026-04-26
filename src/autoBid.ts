import config from "@/config";
import { sendMessage } from "@/bot";
import { placeBid } from "@/bidder";
import Job from "@/models/Job";
import { escapeTelegramHtml, escapeHref } from "@/utils/telegramFormat";
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

const runAutoBid = async (p: {
  jobid: string;
  groupMessageId?: number;
  channelMessageId?: number;
  job: ScrapedJobType;
}) => {
  const { jobid, groupMessageId, job } = p;
  console.log(`[AUTO_BID] Starting for job ${jobid}`);

  const result = await placeBid(jobid, {
    descFallback: job.desc || "",
  });

  if (result.ok) {
    await Job.updateOne(
      { id: jobid },
      { $set: { bidPlaced: true, bidText: result.bidText } },
    );

    const bidBlock = `📝 <b>入札文</b>\n\n${escapeTelegramHtml(result.bidText)}`;
    if (groupMessageId != null) {
      await sendMessage(config.TELEGRAM_DISCUSSION_GROUP_ID, bidBlock, {
        replyToMessageId: groupMessageId,
        linkPreviewOff: true,
      });
    } else {
      await sendMessage(config.TELEGRAM_DISCUSSION_GROUP_ID, bidBlock, {
        linkPreviewOff: true,
      });
    }

    const title = escapeTelegramHtml(job.title || "案件");
    const link = job.url ? escapeHref(job.url) : "";
    const channelBlock =
      `✅ <b>入札済み</b> — 案件: ${title}\n` +
      (link ? `🔗 <a href="${link}">案件ページ</a>\n` : "") +
      `\n${bidBlock}`;
    await sendMessage(config.TELEGRAM_CHANNEL_ID, channelBlock, {
      linkPreviewOff: true,
    });
  } else {
    const err = (result as { ok: false; error: string }).error;
    await sendMessage(
      config.TELEGRAM_CHANNEL_ID,
      `❌ 自動入札失敗 (ID: <code>${escapeTelegramHtml(jobid)}</code>)\n${escapeTelegramHtml(
        err.slice(0, 2000),
      )}`,
      { linkPreviewOff: true },
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
