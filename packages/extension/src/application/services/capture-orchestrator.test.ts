import { describe, expect, it } from 'vitest';
import {
  parseSessionIdentifier,
  type SessionIdentifier,
} from '../../domain/session/session-identifier';
import { type StartSourceCommand } from '../ports/source-adapter';
import { createCaptureOrchestrator } from './capture-orchestrator';

const SESSION_ID = '01HZX8Y1R8M7D3Q2P4T5V6W7A1';
const sessionIdentifier: SessionIdentifier = parseSessionIdentifier(SESSION_ID)._unsafeUnwrap();

const buildMicCommand = (): StartSourceCommand => ({
  sourceType: 'microphone',
  sessionIdentifier,
  deviceId: 'default',
});

const buildTabCommand = (): StartSourceCommand => ({
  sourceType: 'tab',
  sessionIdentifier,
});

describe('createCaptureOrchestrator (IMPL-341, SW-safe placeholder)', () => {
  it('connect returns ActiveCapture with empty frame channel for tab source', async () => {
    const orchestrator = createCaptureOrchestrator();
    const result = await orchestrator.connect(buildTabCommand());
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.sessionIdentifier).toBe(sessionIdentifier);
      expect(result.value.sourceType).toBe('tab');
      // frame channel is empty: iterate 即 done (offscreen 経路が実 stream を持つ)
      const iter = result.value.frameChannel.frames[Symbol.asyncIterator]();
      const first = await iter.next();
      expect(first.done).toBe(true);
    }
  });

  it('connect returns ActiveCapture for microphone / desktop sources as well', async () => {
    const orchestrator = createCaptureOrchestrator();
    const result = await orchestrator.connect(buildMicCommand());
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.sourceType).toBe('microphone');
    }
  });

  it('disconnect closes the frame channel and removes the session', async () => {
    const orchestrator = createCaptureOrchestrator();
    const connectResult = await orchestrator.connect(buildTabCommand());
    expect(connectResult.isOk()).toBe(true);
    const disconnectResult = await orchestrator.disconnect(sessionIdentifier);
    expect(disconnectResult.isOk()).toBe(true);
    // 再度 disconnect は no-op
    const repeatResult = await orchestrator.disconnect(sessionIdentifier);
    expect(repeatResult.isOk()).toBe(true);
  });

  it('disconnect is a no-op for an unknown session', async () => {
    const orchestrator = createCaptureOrchestrator();
    const result = await orchestrator.disconnect(sessionIdentifier);
    expect(result.isOk()).toBe(true);
  });
});
