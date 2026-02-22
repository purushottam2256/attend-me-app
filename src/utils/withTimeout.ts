/**
 * withTimeout — Race a promise against a deadline.
 *
 * If the promise doesn't settle within `ms` milliseconds, the returned
 * promise rejects with a descriptive timeout error. This prevents any
 * single Supabase call (or other async operation) from blocking the JS
 * thread indefinitely.
 *
 * Usage:
 *   const data = await withTimeout(supabase.from('x').select(), 10000, 'getStudents');
 */

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(
  promise: Promise<T> | PromiseLike<T>,
  ms = 10000,
  label = 'Operation',
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });

  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

export default withTimeout;
