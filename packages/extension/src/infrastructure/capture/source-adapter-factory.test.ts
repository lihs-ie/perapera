import { okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { type SourceAdapter } from '../../application/ports/source-adapter';
import { createSourceAdapterFactory } from './source-adapter-factory';

const noopAdapter = (): SourceAdapter => ({
  open: () => okAsync(new MediaStream()),
  close: () => okAsync(undefined),
});

describe('createSourceAdapterFactory (IMPL-341 subset — DI routing)', () => {
  it('returns the tab adapter for sourceType=tab', () => {
    const tab = noopAdapter();
    const mic = noopAdapter();
    const desktop = noopAdapter();
    const factory = createSourceAdapterFactory({
      tabCaptureSourceAdapter: tab,
      userMediaSourceAdapter: mic,
      desktopCaptureSourceAdapter: desktop,
    });
    expect(factory.create('tab')).toBe(tab);
  });

  it('returns the microphone adapter for sourceType=microphone', () => {
    const tab = noopAdapter();
    const mic = noopAdapter();
    const desktop = noopAdapter();
    const factory = createSourceAdapterFactory({
      tabCaptureSourceAdapter: tab,
      userMediaSourceAdapter: mic,
      desktopCaptureSourceAdapter: desktop,
    });
    expect(factory.create('microphone')).toBe(mic);
  });

  it('returns the desktop adapter for sourceType=desktop', () => {
    const tab = noopAdapter();
    const mic = noopAdapter();
    const desktop = noopAdapter();
    const factory = createSourceAdapterFactory({
      tabCaptureSourceAdapter: tab,
      userMediaSourceAdapter: mic,
      desktopCaptureSourceAdapter: desktop,
    });
    expect(factory.create('desktop')).toBe(desktop);
  });
});
