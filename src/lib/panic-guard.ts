export const PANIC_MAX_ATTEMPTS = 3;
export const PANIC_LOCK_MS = 60 * 60 * 1000;

class PanicPinGuard {
  private failures = 0;
  private lockedUntil = 0;

  isLocked(now = Date.now()): boolean {
    return now < this.lockedUntil;
  }

  fail(now = Date.now()): void {
    this.failures += 1;
    if (this.failures >= PANIC_MAX_ATTEMPTS) {
      this.lockedUntil = now + PANIC_LOCK_MS;
      this.failures = 0;
    }
  }

  success(): void {
    this.failures = 0;
  }
}

const globalForGuard = globalThis as unknown as { __panicGuard?: PanicPinGuard };

export const panicGuard = (globalForGuard.__panicGuard ??= new PanicPinGuard());
