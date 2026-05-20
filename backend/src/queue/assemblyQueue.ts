import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import axios from 'axios';
import { assembleVideo, AssemblyOptions } from '../services/videoAssembly';

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

export const assemblyQueue = new Queue('video-assembly', { 
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true,
    removeOnFail: false, // Dead letter queue behavior
  }
});

export const addAssemblyJob = async (userId: string, options: AssemblyOptions, webhookUrl?: string) => {
  const job = await assemblyQueue.add('assemble-video', { userId, options, webhookUrl });
  return job;
};

export const assemblyWorker = new Worker('video-assembly', async (job: Job) => {
  console.log(`Processing assembly job ${job.id} for user ${job.data.userId}`);
  
  job.updateProgress(10);
  
  try {
    const finalVideoPath = await assembleVideo(job.data.options);
    job.updateProgress(100);
    return { status: 'success', finalVideoPath };
  } catch (error: any) {
    throw new Error(`Video assembly failed: ${error.message}`);
  }
}, { connection });

assemblyWorker.on('completed', async (job) => {
  console.log(`Assembly Job ${job.id} has completed successfully!`);
  if (job.data.webhookUrl) {
    try { await axios.post(job.data.webhookUrl, { jobId: job.id, status: 'completed', result: job.returnvalue }); } catch(e) {}
  }
});

assemblyWorker.on('failed', async (job, err) => {
  console.log(`Assembly Job ${job?.id} has failed with ${err.message}`);
  if (job && job.data.webhookUrl) {
    try { await axios.post(job.data.webhookUrl, { jobId: job.id, status: 'failed', error: err.message }); } catch(e) {}
  }
});
