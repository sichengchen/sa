import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe as baseDescribe,
  expect,
  it as baseIt,
  test as baseTest,
  vi,
} from "vitest";

type ConditionalDescribe = typeof baseDescribe & {
  if(condition: boolean): typeof baseDescribe;
};

type ConditionalTest = typeof baseTest & {
  if(condition: boolean): typeof baseTest;
};

export const describe = Object.assign(baseDescribe, {
  if(condition: boolean) {
    return baseDescribe.runIf(condition);
  },
}) as ConditionalDescribe;

export const test = Object.assign(baseTest, {
  if(condition: boolean) {
    return baseTest.runIf(condition);
  },
}) as ConditionalTest;

export const it = Object.assign(baseIt, {
  if(condition: boolean) {
    return baseIt.runIf(condition);
  },
}) as ConditionalTest;

export const mock = Object.assign(vi.fn, {
  module(specifier: string, factory: () => unknown) {
    vi.doMock(specifier, factory as Parameters<typeof vi.doMock>[1]);
  },
  clearAllMocks: vi.clearAllMocks,
  resetAllMocks: vi.resetAllMocks,
  restoreAllMocks: vi.restoreAllMocks,
});

export { afterAll, afterEach, beforeAll, beforeEach, expect, vi };
