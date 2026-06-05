import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CursorBlink } from './cursor-blink';

describe('CursorBlink atom (perapera-transcript.jsx Cursor 移植)', () => {
  it('renders an inline-block span with 7px width', () => {
    const { container } = render(<CursorBlink />);
    const span = container.firstChild as HTMLElement;
    expect(span.tagName).toBe('SPAN');
    expect(span.style.display).toBe('inline-block');
    expect(span.style.width).toBe('7px');
  });

  it('uses pp-cursor animation with 2-step blink', () => {
    const { container } = render(<CursorBlink />);
    const span = container.firstChild as HTMLElement;
    expect(span.style.animation).toContain('pp-cursor');
    expect(span.style.animation).toContain('1.05s');
    expect(span.style.animation).toContain('steps(2)');
  });

  it('inline=true shrinks marginLeft to 2px', () => {
    const { container } = render(<CursorBlink inline />);
    const span = container.firstChild as HTMLElement;
    expect(span.style.marginLeft).toBe('2px');
    expect(span.dataset.inline).toBe('true');
  });

  it('inline=false (default) uses 3px marginLeft', () => {
    const { container } = render(<CursorBlink />);
    const span = container.firstChild as HTMLElement;
    expect(span.style.marginLeft).toBe('3px');
    expect(span.dataset.inline).toBe('false');
  });

  it('applies accent glow shadow', () => {
    const { container } = render(<CursorBlink />);
    const span = container.firstChild as HTMLElement;
    expect(span.style.boxShadow).toContain('rgba(45,212,191,0.35)');
  });

  it('is decorative (aria-hidden=true)', () => {
    const { container } = render(<CursorBlink />);
    const span = container.firstChild as HTMLElement;
    expect(span.getAttribute('aria-hidden')).toBe('true');
  });
});
