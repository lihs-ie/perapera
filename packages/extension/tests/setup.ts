import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Minimal chrome.* stub so modules touching the API won't throw at import time.
// Individual tests should replace sub-APIs with typed mocks as needed.
type ChromeStub = {
  runtime: { id: string; sendMessage: ReturnType<typeof vi.fn> };
  storage: { local: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> } };
  tabs: { query: ReturnType<typeof vi.fn> };
};

const chromeStub: ChromeStub = {
  runtime: {
    id: 'test-extension-id',
    sendMessage: vi.fn(),
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
  tabs: {
    query: vi.fn(),
  },
};

Object.defineProperty(globalThis, 'chrome', {
  value: chromeStub,
  writable: true,
  configurable: true,
});
