import { ok, okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { type DomainError } from '../../domain/shared/errors';
import { type SttPort, type SttStreamHandle, type TranscriptEvent } from './stt-port';

describe('SttPort contract', () => {
  it('can be implemented with ok/AsyncIterable for test purposes', async () => {
    const events: TranscriptEvent[] = [
      {
        type: 'partial',
        segmentId: 'seg_1',
        revision: 1,
        text: 'hello',
        language: 'en',
        startOffsetMs: 0,
        endOffsetMs: 100,
      },
      {
        type: 'final',
        segmentId: 'seg_1',
        text: 'hello',
        language: 'en',
        startOffsetMs: 0,
        endOffsetMs: 200,
        finalizedAt: '2026-04-21T00:00:00.000Z',
        endpointingTrigger: 'provider_default',
      },
    ];
    const handle: SttStreamHandle = {
      sendFrame: () => ok(undefined),
      close: () => okAsync<void, DomainError>(undefined),
      events: {
        [Symbol.asyncIterator]: () => {
          let index = 0;
          return {
            next: (): Promise<IteratorResult<TranscriptEvent>> => {
              if (index >= events.length) {
                return Promise.resolve({ done: true, value: undefined });
              }
              const event = events[index];
              index += 1;
              if (event === undefined) {
                return Promise.resolve({ done: true, value: undefined });
              }
              return Promise.resolve({ done: false, value: event });
            },
          };
        },
      },
    };
    const port: SttPort = {
      openStream: () => okAsync<SttStreamHandle, DomainError>(handle),
    };
    const opened = await port.openStream({ sourceLanguage: 'en-US', autoDetectLanguage: false });
    expect(opened.isOk()).toBe(true);
    if (!opened.isOk()) return;
    const collected: TranscriptEvent[] = [];
    for await (const event of opened.value.events) collected.push(event);
    expect(collected).toHaveLength(2);
    expect(collected[0]?.type).toBe('partial');
    expect(collected[1]?.type).toBe('final');
  });
});
