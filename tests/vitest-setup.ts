import { expect } from "vitest";

expect.extend({
  toStartWith(received: unknown, prefix: string) {
    const pass = typeof received === "string" && received.startsWith(prefix);
    return {
      pass,
      message: () =>
        pass
          ? `expected ${String(received)} not to start with ${prefix}`
          : `expected ${String(received)} to start with ${prefix}`,
    };
  },
  toBeString(received: unknown) {
    const pass = typeof received === "string";
    return {
      pass,
      message: () =>
        pass
          ? `expected ${String(received)} not to be a string`
          : `expected ${String(received)} to be a string`,
    };
  },
  toBeNumber(received: unknown) {
    const pass = typeof received === "number" && Number.isFinite(received);
    return {
      pass,
      message: () =>
        pass
          ? `expected ${String(received)} not to be a finite number`
          : `expected ${String(received)} to be a finite number`,
    };
  },
  toBeTrue(received: unknown) {
    const pass = received === true;
    return {
      pass,
      message: () =>
        pass
          ? `expected ${String(received)} not to be true`
          : `expected ${String(received)} to be true`,
    };
  },
});
