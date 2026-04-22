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
  offscreen: {
    Reason: Readonly<Record<string, string>>;
    hasDocument: ReturnType<typeof vi.fn>;
    createDocument: ReturnType<typeof vi.fn>;
    closeDocument: ReturnType<typeof vi.fn>;
  };
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
  offscreen: {
    // `chrome.offscreen.Reason` is a string enum in `@types/chrome`. The stub
    // mirrors the string-value shape so modules that reference
    // `chrome.offscreen.Reason.X` don't fail at import time in jsdom.
    Reason: Object.freeze({
      TESTING: 'TESTING',
      AUDIO_PLAYBACK: 'AUDIO_PLAYBACK',
      IFRAME_SCRIPTING: 'IFRAME_SCRIPTING',
      DOM_SCRAPING: 'DOM_SCRAPING',
      BLOBS: 'BLOBS',
      DOM_PARSER: 'DOM_PARSER',
      USER_MEDIA: 'USER_MEDIA',
      DISPLAY_MEDIA: 'DISPLAY_MEDIA',
      WEB_RTC: 'WEB_RTC',
      CLIPBOARD: 'CLIPBOARD',
      LOCAL_STORAGE: 'LOCAL_STORAGE',
      WORKERS: 'WORKERS',
      BATTERY_STATUS: 'BATTERY_STATUS',
      MATCH_MEDIA: 'MATCH_MEDIA',
      GEOLOCATION: 'GEOLOCATION',
    }),
    hasDocument: vi.fn(),
    createDocument: vi.fn(),
    closeDocument: vi.fn(),
  },
};

Object.defineProperty(globalThis, 'chrome', {
  value: chromeStub,
  writable: true,
  configurable: true,
});

// jsdom does not provide MediaStream / MediaStreamTrack globals. We polyfill
// minimal class stubs so test code can reference the DOM type when
// constructing fake streams (adapter tests only validate DI wiring, not real
// audio routing — those are covered by E2E).
if (typeof globalThis.MediaStream === 'undefined') {
  class MediaStreamStub {
    public readonly id: string;
    public readonly active: boolean = true;
    private readonly tracks: unknown[] = [];
    constructor(tracks?: unknown[]) {
      this.id = `stub-media-stream-${String(Math.random()).slice(2, 8)}`;
      if (tracks !== undefined) this.tracks.push(...tracks);
    }
    getTracks(): unknown[] {
      return [...this.tracks];
    }
    getAudioTracks(): unknown[] {
      return [...this.tracks];
    }
    getVideoTracks(): unknown[] {
      return [];
    }
    addTrack(track: unknown): void {
      this.tracks.push(track);
    }
    removeTrack(track: unknown): void {
      const index = this.tracks.indexOf(track);
      if (index >= 0) this.tracks.splice(index, 1);
    }
  }
  Object.defineProperty(globalThis, 'MediaStream', {
    value: MediaStreamStub,
    writable: true,
    configurable: true,
  });
}
