import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const region = process.env.AWS_REGION ?? 'us-east-1';

export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
  marshallOptions: { removeUndefinedValues: true },
});
export const sqs = new SQSClient({ region });

export const JOBS_TABLE = process.env.JOBS_TABLE ?? 'dxp-jobs';
export const RATE_TABLE = process.env.RATE_TABLE ?? 'dxp-rate';
export const QUEUE_URL = process.env.QUEUE_URL ?? '';
export const REPORT_BASE = process.env.REPORT_BASE ?? '/reports';

export type JobStatus = 'queued' | 'running' | 'ready' | 'failed' | 'rejected';

export interface Job {
  job_id: string;
  url: string;
  site_id?: string;
  status: JobStatus;
  phase?: string;
  pages_done?: number;
  pages_total?: number;
  created_at: string;
  updated_at: string;
  bundle_id?: string;
  report_key?: string;
  pdf_key?: string;
  score?: number | null;
  assessed?: number;
  needs_review?: number;
  not_assessable?: number;
  error?: string;
  expires_at: number;
}

export async function putJob(job: Job): Promise<void> {
  await ddb.send(new PutCommand({ TableName: JOBS_TABLE, Item: job }));
}

export async function getJob(jobId: string): Promise<Job | null> {
  const res = await ddb.send(new GetCommand({ TableName: JOBS_TABLE, Key: { job_id: jobId } }));
  return (res.Item as Job | undefined) ?? null;
}

export async function patchJob(jobId: string, patch: Partial<Job>): Promise<void> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;

  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const sets: string[] = [];

  entries.forEach(([k, v], i) => {
    names[`#k${i}`] = k;
    values[`:v${i}`] = v;
    sets.push(`#k${i} = :v${i}`);
  });
  names['#u'] = 'updated_at';
  values[':now'] = new Date().toISOString();

  await ddb.send(
    new UpdateCommand({
      TableName: JOBS_TABLE,
      Key: { job_id: jobId },
      UpdateExpression: `SET ${sets.join(', ')}, #u = :now`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

export interface ScanRequest {
  jobId: string;
  url: string;
  siteId?: string;
  mode?: 'quick' | 'full';
  maxPages?: number;
}

export async function enqueue(
  jobId: string,
  url: string,
  sampling: Omit<ScanRequest, 'jobId' | 'url'> = {},
): Promise<void> {
  if (!QUEUE_URL) throw new Error('QUEUE_URL is not configured');
  const request: ScanRequest = { jobId, url, ...sampling };
  await sqs.send(
    new SendMessageCommand({ QueueUrl: QUEUE_URL, MessageBody: JSON.stringify(request) }),
  );
}

export async function consumeRateToken(ip: string, limit: number, windowSeconds: number): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
  const key = `${ip}#${bucket}`;
  try {
    const res = await ddb.send(
      new UpdateCommand({
        TableName: RATE_TABLE,
        Key: { rate_key: key },
        UpdateExpression: 'SET expires_at = :exp ADD hits :one',
        ExpressionAttributeValues: {
          ':one': 1,
          ':exp': (bucket + 2) * windowSeconds,
          ':limit': limit,
        },
        ConditionExpression: 'attribute_not_exists(hits) OR hits < :limit',
      }),
    );
    return res.$metadata.httpStatusCode === 200;
  } catch {
    return false;
  }
}
