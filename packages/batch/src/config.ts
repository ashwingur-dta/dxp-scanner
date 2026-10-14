import { resolve } from 'node:path';

export function targetsDir(): string {
  const explicit = process.env.TARGETS_DIR;
  if (explicit) return resolve(explicit);
  return resolve(process.env.LAMBDA_TASK_ROOT ?? process.cwd(), 'targets');
}
