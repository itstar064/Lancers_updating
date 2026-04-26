import { onNewScrapedJob } from "@/flows/newJobPopupFlow";
import Job from "./models/Job";
import { ScrapedJobType } from "./types/job";
import { delay } from "./utils";

const processScrapedJob = async (jobs: ScrapedJobType[]) => {
  console.log(`🔄 Processing ${jobs.length} jobs...`);
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const jobid = (job as any).id || job.url.split("/").pop() || "";
    console.log(`🔍 Checking job ID: ${jobid}`);

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
      await onNewScrapedJob(job, jobid);
    } else {
      console.log(`⏭️  Job already exists, skipping. ID: ${jobid}`);
    }
    await delay(200);
  }
  console.log(`✅ Finished processing ${jobs.length} jobs`);
};

export default processScrapedJob;
