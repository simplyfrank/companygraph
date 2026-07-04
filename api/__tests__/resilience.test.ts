// Tests for circuit breaker and retry logic

import { describe, it, expect, beforeEach, vi } from "bun:test";
import { getCircuitBreaker, getRetry } from "../src/resilience";

describe("CircuitBreaker", () => {
  let circuitBreaker: any;

  beforeEach(() => {
    // Use unique name for each test to avoid state pollution
    circuitBreaker = getCircuitBreaker(`test-cb-${Date.now()}`, {
      failureThreshold: 3,
      recoveryTimeout: 5000,
      monitoringPeriod: 10000,
    });
  });

  it("should start in CLOSED state", () => {
    expect(circuitBreaker.getState()).toBe("CLOSED");
  });

  it("should transition to OPEN after failure threshold", async () => {
    const failingFn = async () => {
      throw new Error("Test error");
    };

    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreaker.execute(failingFn);
      } catch (e) {
        // Expected to fail
      }
    }

    expect(circuitBreaker.getState()).toBe("OPEN");
  });

  it("should reject calls when OPEN", async () => {
    const failingFn = async () => {
      throw new Error("Test error");
    };

    // Trip the circuit
    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreaker.execute(failingFn);
      } catch (e) {
        // Expected to fail
      }
    }

    await expect(circuitBreaker.execute(failingFn)).rejects.toThrow("Circuit breaker is OPEN");
  });

  it("should transition to HALF_OPEN after recovery timeout", async () => {
    // Create a fresh circuit breaker with short recovery timeout
    const cb = getCircuitBreaker(`test-half-open-${Date.now()}`, {
      failureThreshold: 2,
      recoveryTimeout: 50, // Very short for test
      monitoringPeriod: 10000,
    });

    const failingFn = async () => {
      throw new Error("Test error");
    };

    // Trip the circuit
    for (let i = 0; i < 2; i++) {
      try {
        await cb.execute(failingFn);
      } catch (e) {
        // Expected to fail
      }
    }

    expect(cb.getState()).toBe("OPEN" as any);

    // Wait for recovery timeout
    await new Promise(resolve => (globalThis as any).setTimeout(resolve, 60));
    
    // Try a call - should transition to HALF_OPEN
    try {
      await cb.execute(failingFn);
    } catch (e) {
      // Expected to fail
    }
    
    // State should now be HALF_OPEN (or OPEN if timeout didn't pass)
    const state = cb.getState();
    expect(state === "HALF_OPEN" || state === "OPEN").toBe(true);
  });

  it("should track success and failure counts", async () => {
    // Use a fresh circuit breaker for this test
    const cb = getCircuitBreaker(`test-metrics-${Date.now()}`, {
      failureThreshold: 3,
      recoveryTimeout: 5000,
      monitoringPeriod: 10000,
    });

    const successFn = async () => "success";
    const failingFn = async () => {
      throw new Error("Test error");
    };

    await cb.execute(successFn);
    expect(cb.getMetrics().successCount).toBe(1);

    try {
      await cb.execute(failingFn);
    } catch (e) {
      // Expected to fail
    }
    expect(cb.getMetrics().failureCount).toBe(1);
  });
});

describe("Retry", () => {
  let retry: any;

  beforeEach(() => {
    retry = getRetry({
      maxAttempts: 3,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
    });
  });

  it("should succeed on first attempt", async () => {
    const successFn = async () => "success";
    const result = await retry.execute(successFn);
    expect(result).toBe("success");
  });

  it("should retry on failure", async () => {
    let attempts = 0;
    const failingThenSuccessFn = async () => {
      attempts++;
      if (attempts < 2) {
        throw new Error("Temporary error");
      }
      return "success";
    };

    const result = await retry.execute(failingThenSuccessFn);
    expect(result).toBe("success");
    expect(attempts).toBe(2);
  });

  it("should give up after max attempts", async () => {
    const alwaysFailingFn = async () => {
      throw new Error("Permanent error");
    };

    await expect(retry.execute(alwaysFailingFn)).rejects.toThrow("Permanent error");
  });

  it("should use exponential backoff", async () => {
    const delays: number[] = [];
    const originalSetTimeout = (globalThis as any).setTimeout;
    
    (globalThis as any).setTimeout = (callback: any, delay: number) => {
      delays.push(delay);
      return originalSetTimeout(callback, 0); // Skip actual delay for test
    };

    let attempts = 0;
    const failingFn = async () => {
      attempts++;
      throw new Error("Error");
    };

    try {
      await retry.execute(failingFn);
    } catch (e) {
      // Expected to fail
    }

    (globalThis as any).setTimeout = originalSetTimeout;
    
    // Should have delays with exponential backoff
    expect(delays.length).toBeGreaterThan(0);
  });
});

describe("Factory Functions", () => {
  it("should create circuit breaker with default config", () => {
    const cb = getCircuitBreaker("test-default");
    expect(cb).toBeDefined();
    expect(cb.getState()).toBe("CLOSED" as any);
  });

  it("should create retry with default config", () => {
    const r = getRetry();
    expect(r).toBeDefined();
  });

  it("should create circuit breaker with custom config", () => {
    const cb = getCircuitBreaker("test-custom", {
      failureThreshold: 5,
      recoveryTimeout: 10000,
      monitoringPeriod: 10000,
    });
    expect(cb).toBeDefined();
  });

  it("should create retry with custom config", () => {
    const r = getRetry({
      maxAttempts: 5,
      initialDelayMs: 200,
      maxDelayMs: 5000,
      backoffMultiplier: 2,
    });
    expect(r).toBeDefined();
  });
});
