import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import axios from 'axios';

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

export const scriptQueue = new Queue('script-parsing', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
    removeOnFail: false, // Dead letter queue behavior
  }
});

export const addScriptJob = async (scriptText: string, userId: string, webhookUrl?: string) => {
  return await scriptQueue.add('parse-script', { scriptText, userId, webhookUrl });
};

export const scriptWorker = new Worker('script-parsing', async (job: Job) => {
  console.log(`Processing script job ${job.id} for user ${job.data.userId}`);
  job.updateProgress(10);
  
  // Simulated parsing logic
  const parsedScenes = job.data.scriptText.split('\n').filter((l: string) => l.trim().length > 0);
  
  job.updateProgress(100);
  return { status: 'success', parsedScenes };
}, { connection });

scriptWorker.on('completed', async (job) => {
  console.log(`Script Job ${job.id} completed!`);
  if (job.data.webhookUrl) {
    try { await axios.post(job.data.webhookUrl, { jobId: job.id, status: 'completed', result: job.returnvalue }); } catch(e) {}
  }
});

scriptWorker.on('failed', async (job, err) => {
  console.log(`Script Job ${job?.id} failed with ${err.message}`);
  if (job && job.data.webhookUrl) {
    try { await axios.post(job.data.webhookUrl, { jobId: job.id, status: 'failed', error: err.message }); } catch(e) {}
  }
});
