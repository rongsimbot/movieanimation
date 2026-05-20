import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import axios from 'axios';

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

export const assetQueue = new Queue('asset-processing', { 
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true,
    removeOnFail: false, // Dead letter queue behavior
  }
});

export const addAssetJob = async (assetUrl: string, userId: string, webhookUrl?: string) => {
  const job = await assetQueue.add('process-asset', { assetUrl, userId, webhookUrl });
  return job;
};

export const assetWorker = new Worker('asset-processing', async (job: Job) => {
  console.log(`Processing asset job ${job.id} for user ${job.data.userId}`);
  
  job.updateProgress(10);
  
  try {
    // Simulated asset processing
    const processedAssetPath = `/tmp/processed_${job.id}.png`;
    job.updateProgress(100);
    return { status: 'success', processedAssetPath };
  } catch (error: any) {
    throw new Error(`Asset processing failed: ${error.message}`);
  }
}, { connection });

assetWorker.on('completed', async (job) => {
  console.log(`Asset Job ${job.id} has completed successfully!`);
  if (job.data.webhookUrl) {
    try { await axios.post(job.data.webhookUrl, { jobId: job.id, status: 'completed', result: job.returnvalue }); } catch(e) {}
  }
});

assetWorker.on('failed', async (job, err) => {
  console.log(`Asset Job ${job?.id} has failed with ${err.message}`);
  if (job && job.data.webhookUrl) {
    try { await axios.post(job.data.webhookUrl, { jobId: job.id, status: 'failed', error: err.message }); } catch(e) {}
  }
});
