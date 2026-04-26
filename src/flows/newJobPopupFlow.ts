/**
 * 新規案件がDBに挿入された直後: チャンネル＆ディスカッション群にカードを送る。
 * ブラウザでLancersへ入札するのは `config.AUTO_BID === true` のときだけ（placeBid / Playwright）。
 */
import { sendMessage } from "@/bot";
import { scheduleAutoBid } from "@/autoBid";
import config from "@/config";
import Job from "@/models/Job";
import type { ScrapedJobType } from "@/types/job";
import { escapeTelegramHtml, escapeHref } from "@/utils/telegramFormat";

const TELEGRAM_CAPTION_MAX = 1024;
const TELEGRAM_MESSAGE_MAX = 4096;

const buildNewJobCardHtml = (job: ScrapedJobType) => {
  const maxLen = job.employerAvatar
    ? TELEGRAM_CAPTION_MAX
    : TELEGRAM_MESSAGE_MAX;
  const jobid = (job as { id?: string }).id || job.url.split("/").pop() || "";

  let message = `🔉 <b>${escapeTelegramHtml(job.title)}</b>\n\n`;
  if (jobid) {
    message += `<b>ID:</b> ${escapeTelegramHtml(job.employer)}\n`;
  }
  if (job.category) {
    message += `<b>カテゴリ:</b> ${escapeTelegramHtml(job.category)}\n`;
  }
  if (job.daysLeft) {
    message += `<b>期間:</b> ${escapeTelegramHtml(job.daysLeft)}\n`;
  }
  if (job.price) {
    message += `<b>報酬:</b> ${escapeTelegramHtml(job.price)}円\n`;
  }

  const linkFooter = job.url
    ? `\n\n<a href="${escapeHref(job.url)}">案件ページ</a>`
    : "";

  if (job.desc) {
    const header = "\n<b>概要:</b>\n";
    const plain = job.desc.replace(/\s+/g, " ").trim();
    const budget = maxLen - message.length - header.length - linkFooter.length;
    const ellipsis = "…";
    if (budget > 0 && plain) {
      let snippet = "";
      for (let len = plain.length; len >= 0; len--) {
        const cand =
          len === plain.length ? plain : plain.slice(0, len) + ellipsis;
        if (escapeTelegramHtml(cand).length <= budget) {
          snippet = cand;
          break;
        }
      }
      if (snippet) {
        message += header + escapeTelegramHtml(snippet);
      }
    }
  }
  if (linkFooter) {
    message += linkFooter;
  }
  return { message, jobid };
};

/**
 * 新規1件: Telegram通知 + message_id保存。自動入札ONなら従来どおり入札キュー。
 */
export const onNewScrapedJob = async (job: ScrapedJobType, jobid: string) => {
  const { message } = buildNewJobCardHtml(job);

  const channelRes = await sendMessage(
    config.TELEGRAM_CHANNEL_ID,
    message,
    job.employerAvatar,
  );
  const groupRes = await sendMessage(
    config.TELEGRAM_DISCUSSION_GROUP_ID,
    message,
    job.employerAvatar,
  );

  const channelMessageId = (channelRes as { message_id?: number })?.message_id;
  const groupMessageId = (groupRes as { message_id?: number })?.message_id;

  await Job.updateOne(
    { id: jobid },
    { $set: { channelMessageId, groupMessageId } },
  );

  if (!config.AUTO_BID) {
    return;
  }

  const pending = `⏳ <b>新規</b> 入札を試行中 (ID: <code>${escapeTelegramHtml(
    jobid,
  )}</code>)…`;
  if (groupMessageId != null) {
    await sendMessage(config.TELEGRAM_DISCUSSION_GROUP_ID, pending, {
      replyToMessageId: groupMessageId,
      linkPreviewOff: true,
    });
  }
  if (channelMessageId != null) {
    await sendMessage(config.TELEGRAM_CHANNEL_ID, pending, {
      replyToMessageId: channelMessageId,
      linkPreviewOff: true,
    });
  }

  scheduleAutoBid({
    jobid,
    groupMessageId,
    channelMessageId,
    job,
  });
};
