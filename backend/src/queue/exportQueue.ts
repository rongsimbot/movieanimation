import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import axios from 'axios';
import { exportVideo, ExportOptions } from '../services/videoExport';

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

export const exportQueue = new Queue('video-export', { 
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true,
    removeOnFail: false, // Dead letter queue behavior
  }
});

export const addExportJob = async (userId: string, options: ExportOptions, webhookUrl?: string) => {
  const job = await exportQueue.add('export-video', { userId, options, webhookUrl });
  return job;
};

export const exportWorker = new Worker('video-export', async (job: Job) => {
  console.log(`Processing export job ${job.id} for user ${job.data.userId}`);
  console.log(`Target: ${job.data.options.resolution} / ${job.data.options.format}`);
  
  job.updateProgress(10);
  
  try {
    const finalRenderPath = await exportVideo(job.data.options);
    job.updateProgress(100);
    return { status: 'success', finalRenderPath };
  } catch (error: any) {
    throw new Error(`Video export failed: ${error.message}`);
  }
}, { connection });

exportWorker.on('completed', async (job) => {
  console.log(`Export Job ${job.id} has completed successfully!`);
  if (job.data.webhookUrl) {
    try { await axios.post(job.data.webhookUrl, { jobId: job.id, status: 'completed', result: job.returnvalue }); } catch(e) {}
  }
});

exportWorker.on('failed', async (job, err) => {
  console.log(`Export Job ${job?.id} has failed with ${err.message}`);
  if (job && job.data.webhookUrl) {
    try { await axios.post(job.data.webhookUrl, { jobId: job.id, status: 'failed', error: err.message }); } catch(e) {}
  }
});
