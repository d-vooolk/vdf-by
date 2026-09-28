export class FrameBusyError extends Error {}

const running = new Set<string>();

export async function exclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
  if (running.has(key)) throw new FrameBusyError("Эта карточка ещё обрабатывается — повторим чуть позже");
  running.add(key);
  try {
    return await task();
  } finally {
    running.delete(key);
  }
}
