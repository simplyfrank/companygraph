// Graceful shutdown handling for production deployments

let isShuttingDown = false;
const shutdownCallbacks: Array<() => Promise<void>> = [];

export function registerShutdownCallback(callback: () => Promise<void>): void {
  shutdownCallbacks.push(callback);
}

export async function handleShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  // eslint-disable-next-line no-console
  (globalThis as any).console.log(`Received ${signal}, starting graceful shutdown...`);

  // Give 30 seconds for graceful shutdown
  const shutdownTimeout = (globalThis as any).setTimeout(() => {
    // eslint-disable-next-line no-console
    (globalThis as any).console.error("Graceful shutdown timeout, forcing exit");
    (globalThis as any).process?.exit?.(1);
  }, 30000);

  try {
    // Execute all shutdown callbacks in parallel
    await Promise.all(shutdownCallbacks.map(async (callback) => {
      try {
        await callback();
      } catch (error) {
        // eslint-disable-next-line no-console
        (globalThis as any).console.error("Error during shutdown callback:", error);
      }
    }));

    (globalThis as any).clearTimeout(shutdownTimeout);
    // eslint-disable-next-line no-console
    (globalThis as any).console.log("Graceful shutdown complete");
    (globalThis as any).process?.exit?.(0);
  } catch (error) {
    (globalThis as any).clearTimeout(shutdownTimeout);
    // eslint-disable-next-line no-console
    (globalThis as any).console.error("Error during graceful shutdown:", error);
    (globalThis as any).process?.exit?.(1);
  }
}

export function setupShutdownHandlers(): void {
  (globalThis as any).process?.on?.("SIGTERM", () => handleShutdown("SIGTERM"));
  (globalThis as any).process?.on?.("SIGINT", () => handleShutdown("SIGINT"));
}

export function getIsShuttingDown(): boolean {
  return isShuttingDown;
}
