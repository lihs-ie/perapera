import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { createOverlaySettings } from '../../domain/profile/overlay-settings';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { invariantViolationError, type DomainError } from '../../domain/shared/errors';
import {
  parseSegmentIdentifier,
  type SegmentIdentifier,
} from '../../domain/transcript/segment-identifier';
import {
  type OverlayLine,
  type OverlayPresenter,
  type OverlayRenderModel,
} from './overlay-presenter';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const SEGMENT_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7D1';
const sessionIdentifier: SessionIdentifier = parseSessionIdentifier(SESSION_ID)._unsafeUnwrap();
const segmentIdentifier: SegmentIdentifier = parseSegmentIdentifier(SEGMENT_ID)._unsafeUnwrap();

const overlaySettings = createOverlaySettings({
  positionPreset: 'bottom',
  opacity: 0.8,
  maxLines: 2,
  fontScale: 1,
  showOriginalText: true,
  showTranslatedText: true,
})._unsafeUnwrap();

const sampleLine: OverlayLine = {
  segmentIdentifier,
  originalText: 'hello',
  translatedText: 'こんにちは',
  targetLanguage: 'ja-JP',
  isFinal: true,
  precedingSegmentIdentifier: null,
  hasTranslationContext: false,
};

const sampleModel: OverlayRenderModel = {
  sessionIdentifier,
  lines: [sampleLine],
};

const okMock: OverlayPresenter = {
  mount: () => okAsync(undefined),
  render: () => okAsync(undefined),
  updateSettings: () => okAsync(undefined),
  unmount: () => okAsync(undefined),
};

describe('OverlayPresenter (DD-108)', () => {
  describe('type contract', () => {
    it('accepts an object literal implementing all four methods', () => {
      expect(typeof okMock.mount).toBe('function');
      expect(typeof okMock.render).toBe('function');
      expect(typeof okMock.updateSettings).toBe('function');
      expect(typeof okMock.unmount).toBe('function');
    });
  });

  describe('OverlayRenderModel', () => {
    it('carries sessionIdentifier and an ordered list of lines', () => {
      expect(sampleModel.sessionIdentifier).toBe(SESSION_ID);
      expect(sampleModel.lines).toHaveLength(1);
      expect(sampleModel.lines[0]?.segmentIdentifier).toBe(SEGMENT_ID);
    });

    it('OverlayLine allows original-only, translation-only, or both to be present', () => {
      const originalOnly: OverlayLine = {
        segmentIdentifier,
        originalText: 'hello',
        translatedText: null,
        targetLanguage: null,
        isFinal: false,
        precedingSegmentIdentifier: null,
        hasTranslationContext: false,
      };
      const translationOnly: OverlayLine = {
        segmentIdentifier,
        originalText: null,
        translatedText: 'こんにちは',
        targetLanguage: 'ja-JP',
        isFinal: true,
        precedingSegmentIdentifier: null,
        hasTranslationContext: false,
      };
      expect(originalOnly.translatedText).toBeNull();
      expect(translationOnly.originalText).toBeNull();
    });
  });

  describe('mount / render / updateSettings / unmount', () => {
    it('all resolve to ok(void) on the success path', async () => {
      const m = await okMock.mount(sessionIdentifier);
      const r = await okMock.render(sampleModel);
      const u = await okMock.updateSettings(sessionIdentifier, overlaySettings);
      const un = await okMock.unmount(sessionIdentifier);
      expect(m.isOk()).toBe(true);
      expect(r.isOk()).toBe(true);
      expect(u.isOk()).toBe(true);
      expect(un.isOk()).toBe(true);
    });

    it('mount can return invariantViolationError when DOM target is unavailable', async () => {
      const mock: OverlayPresenter = {
        ...okMock,
        mount: () =>
          errAsync<void, DomainError>(
            invariantViolationError({
              invariant: 'overlay-mount-failed',
              details: 'Shadow DOM host not found',
            }),
          ),
      };
      const result = await mock.mount(sessionIdentifier);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.kind).toBe('invariant-violation');
    });
  });
});
