import { sendMessage } from "./bot";
import Job from "./models/Job";
import { ScrapedJobType } from "./types/job";
import { delay } from "./utils";

/** Telegram HTML mode: escape user-controlled text. */
const escapeTelegramHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** `href` attribute: `&` must be escaped for HTML parse mode. */
const escapeHref = (s: string) => s.replace(/&/g, "&amp;");

const TELEGRAM_CAPTION_MAX = 1024;
const TELEGRAM_MESSAGE_MAX = 4096;

const processScrapedJob = async (userid: string, jobs: ScrapedJobType[]) => {
  console.log(`🔄 Processing ${jobs.length} jobs...`);
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    // Use job.id if available, otherwise extract from URL
    const jobid = (job as any).id || job.url.split("/").pop() || "";
    console.log(`🔍 Checking job ID: ${jobid}`);

    // Atomic upsert avoids E11000 when two scrapes race on the same new id.
    let inserted = false;
    try {
      const result = await Job.updateOne(
        { id: jobid },
        { $setOnInsert: { id: jobid, bidPlaced: false } },
        { upsert: true },
      );
      inserted = result.upsertedCount === 1;
    } catch (err: any) {
      if (err?.code === 11000) {
        inserted = false;
      } else {
        throw err;
      }
    }

    if (inserted) {
      console.log(`✨ New job found! ID: ${jobid} - ${job.title}`);
      
      const maxLen = job.employerAvatar
        ? TELEGRAM_CAPTION_MAX
        : TELEGRAM_MESSAGE_MAX;

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
        const budget =
          maxLen - message.length - header.length - linkFooter.length;
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

      await sendMessage(userid, message, job.employerAvatar);
    } else {
      console.log(`⏭️  Job already exists, skipping. ID: ${jobid}`);
    }
    await delay(200);
  }
  console.log(`✅ Finished processing ${jobs.length} jobs`);
};

export default processScrapedJob;
