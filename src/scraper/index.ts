import { delay, isEmpty } from "@/utils";
import config from "@/config";
import processScrapedJob from "@/job.controller";
import axios from "axios";
import { chromium } from "playwright";
import * as cheerio from "cheerio";

let scraping = false;
const searchUrls = [
  "https://www.lancers.jp/work/search/system?open=1&show_description=1&sort=started&type%5B%5D=competition&type%5B%5D=project&type%5B%5D=task&work_rank%5B%5D=0&work_rank%5B%5D=2&work_rank%5B%5D=3",
  "https://www.lancers.jp/work/search/web?open=1&show_description=1&sort=started&type%5B%5D=competition&type%5B%5D=project&type%5B%5D=task&work_rank%5B%5D=0&work_rank%5B%5D=2&work_rank%5B%5D=3",
];

const SEARCH_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/146.0.0.0 Safari/537.36";
const SEARCH_REFERER = "https://www.lancers.jp/mypage";
const AXIOS_TIMEOUT_MS = 20000;



const SCRAPE_LOOP_DELAY_MS = 5000;

const getAuthCookieHeaderWithPlaywright = async () => {
  const browser = await chromium.launch({
    headless: false, // MUST be false for manual login
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("🔐 Logging in automatically (Playwright)...");
  await page.goto("https://www.lancers.jp/user/login");

  // If we were redirected to mypage already, skip login form.
  if (!page.url().includes("/mypage")) {
    await page.waitForSelector("#login_form, form#login_form", {
      timeout: 15000,
    });
    await page.waitForSelector("#UserEmail", { timeout: 10000 });
    await page.waitForSelector("#UserPassword", { timeout: 10000 });
    await page.waitForSelector("#form_submit", { timeout: 10000 });

    await page.fill("#UserEmail", "");
    await page.type("#UserEmail", config.EMAIL, { delay: 30 });

    await page.fill("#UserPassword", "");
    await page.type("#UserPassword", config.PASSWORD, { delay: 30 });

    console.log("➡️ Submitting login form...");
    const navigationPromise = page.waitForNavigation({
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await page.click("#form_submit");
    try {
      await navigationPromise;
    } catch {
      // Some flows may not trigger navigation. We'll check URL below.
    }

    if (page.url().includes("/verify_code")) {
      console.log(
        "⚠️ Verification required (/verify_code). Waiting for /mypage..."
      );
      // Verification might require manual input; wait forever until resolved.
      await page.waitForURL("**/mypage**", { timeout: 0 });
    } else {
      // Wait until mypage to confirm login.
      await page.waitForURL("**/mypage**", { timeout: 30000 });
    }
  }

  console.log("✅ Login detected! Capturing cookies...");

  const cookies = await context.cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

  await browser.close();
  return cookieHeader;
};

const fetchSearchHtml = async (url: string, cookieHeader: string) => {
  const res = await axios.get(url, {
    timeout: AXIOS_TIMEOUT_MS,
    headers: {
      "user-agent": SEARCH_USER_AGENT,
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "accept-language": "ja,en-US;q=0.9,en;q=0.8",
      referer: SEARCH_REFERER,
      cookie: cookieHeader,
    },
    // Lancers pages are server rendered; keep default response handling
    responseType: "text",
  });

  return res.data as string;
};

const parseJobsFromSearchHtml = (html: string) => {
  const $ = cheerio.load(html);
  const cards = $(".p-search-job-media");
  const jobs: any[] = [];

  cards.each((_, card) => {
    const $card = $(card);

    // Job card title anchor
    const $titleAnchor = $card.find(
      ".p-search-job-media__title.c-media__title"
    ).first();

    // Remove tags from title (NEW, 2回目, etc.)
    const $tagsUl = $titleAnchor.find("ul.p-search-job-media__tags");
    if ($tagsUl.length > 0) $tagsUl.remove();

    const title = ($titleAnchor.text() || "").replace(/\s+/g, " ").trim();
    const href = $titleAnchor.attr("href") || "";
    const url = href ? `https://www.lancers.jp${href}` : "";

    // Job ID from onclick attribute first, otherwise from URL
    let jobId = "";
    const onclickAttr = ($card.attr("onclick") || "").toString();
    const match = onclickAttr.match(/goToLjpWorkDetail\((\d+)\)/);
    if (match?.[1]) jobId = match[1];
    if (!jobId) {
      const urlMatch = href.match(/\/work\/detail\/(\d+)/);
      if (urlMatch?.[1]) jobId = urlMatch[1];
    }

    const daysLeft = ($card.find(".p-search-job-media__time-remaining").text() || "").replace(/\s+/g, " ").trim();
    const deadline = ($card.find(".p-search-job-media__time-text").text() || "").replace(/\s+/g, " ").trim();

    // Price: join first two numbers as "<from>~<to>"
    const priceNumbers = $card
      .find(".p-search-job-media__price .p-search-job-media__number")
      .toArray()
      .map((n) => $(n).text().replace(/\s+/g, " ").trim())
      .filter(Boolean);

    let price = "";
    if (priceNumbers.length >= 2) {
      price = `${priceNumbers[0]}~${priceNumbers[1]}`;
    } else if (priceNumbers.length === 1) {
      price = priceNumbers[0];
    }

    const $employerAnchor = $card
      .find(".p-search-job-media__avatar-note.c-avatar__note a")
      .first();
    const employer = ($employerAnchor.text() || "").replace(/\s+/g, " ").trim();
    const employerUrl = $employerAnchor.attr("href")
      ? `https://www.lancers.jp${$employerAnchor.attr("href")}`
      : "";

    const employerAvatar =
      $card.find(".c-avatar__image").first().attr("src") || "";

    const category = $card
      .find(".p-search-job__division-link")
      .toArray()
      .map((el) => $(el).text().replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join(", ");

    const proposals = ($card.find(".p-search-job-media__proposals").text() || "").replace(/\s+/g, " ").trim();

    const workType = ($card.find(".c-badge__text").first().text() || "")
      .replace(/\s+/g, " ")
      .trim();

    // Prose summary lives in `.c-media__description` without the tag-list `<ul>`
    // (that block is 経験者優遇 / 継続依頼あり style chips, not the job body).
    const descriptionParts: string[] = [];
    $card.find(".c-media__description").each((_, el) => {
      const $el = $(el);
      if ($el.find("ul.p-search-job-media__tag-lists").length > 0) {
        return;
      }
      const text = ($el.text() || "").replace(/\s+/g, " ").trim();
      if (text) {
        descriptionParts.push(text);
      }
    });
    const desc = descriptionParts.join("\n\n").trim();

    jobs.push({
      id: jobId,
      title,
      url,
      desc,
      category,
      price,
      suggestions: proposals,
      daysLeft,
      deadline,
      postedDate: "",
      employer,
      employerUrl,
      employerAvatar,
      tags: [],
      workType,
    });
  });

  return jobs;
};

export async function scrapeJobs() {
  let iteration = 0;
  let cookieHeader: string | null = null;

  while (true) {
    // Check if scraping should stop and cleanup
    if (!scraping) {
      break;
    }

    try {
      try {
        const searchUrl = searchUrls[iteration % searchUrls.length];

        if (isEmpty(searchUrl)) continue;

        if (!cookieHeader) {
          cookieHeader = await getAuthCookieHeaderWithPlaywright();
        }

        let html = "";
        try {
          html = await fetchSearchHtml(searchUrl, cookieHeader);
          if(!html.includes("user_id")) {
            throw new Error("Login required");
          }
        } catch (err) {
          console.error(
            "⚠️ Error fetching search HTML (cookie may be expired):",
            (err as Error).message
          );
          cookieHeader = await getAuthCookieHeaderWithPlaywright();
          html = await fetchSearchHtml(searchUrl, cookieHeader);
        }

        const jobs = parseJobsFromSearchHtml(html);

        if (jobs.length === 0) {
          console.log(
            "⚠️ No job cards parsed. Cookie likely expired - re-login next."
          );
          cookieHeader = null;
          continue;
        }

        console.log(`✅ Scraped ${jobs.length} jobs from page`);
        jobs.forEach((job: any) => {
          const jobId =
            job.id || (job.url ? job.url.split("/").pop() : "unknown");
          console.log(`📋 Job ID: ${jobId} - ${job.title || "No title"}`);
        });

        try {
          processScrapedJob(config.ADMIN_ID, jobs.reverse());
        } catch (err) {
          console.error("Error in processScrapedJob:", (err as Error).message);
        }
        await delay(SCRAPE_LOOP_DELAY_MS);

        // Increment iteration after successful scrape
        iteration++;
      } catch (err) {
        console.error("Error in user scraping loop:", (err as Error).message);
        continue;
      }
    } catch (err) {
      console.error("Error in scrapeJobs loop:", (err as Error).message);
    }
    // No longer close browser/page here; handled by restart logic above
  }
}

export const startScraping = async () => {
  try {
    scraping = true;
    await scrapeJobs();
  } catch (error) {
    console.error(
      "Error occurred while scraping jobs:",
      (error as Error).message,
    );
  }
};

export const stopScraping = () => {
  scraping = false;
};

export const getScrapingStatus = () => {
  return scraping;
};
