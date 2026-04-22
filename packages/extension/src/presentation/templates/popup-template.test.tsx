import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PopupTemplate } from './popup-template';

describe('PopupTemplate (IMPL-550)', () => {
  it('renders header with title', () => {
    render(<PopupTemplate formSlot={<div>form</div>} listSlot={<div>list</div>} />);
    expect(screen.getByRole('heading', { level: 1, name: 'perapera' })).toBeInTheDocument();
  });

  it('renders version when provided', () => {
    render(<PopupTemplate formSlot={<div>form</div>} listSlot={<div>list</div>} version="0.1.0" />);
    expect(screen.getByText('v0.1.0')).toBeInTheDocument();
  });

  it('omits version when not provided', () => {
    render(<PopupTemplate formSlot={<div>form</div>} listSlot={<div>list</div>} />);
    expect(screen.queryByText(/^v/)).toBeNull();
  });

  it('renders formSlot and listSlot contents', () => {
    render(<PopupTemplate formSlot={<div>FORM-HERE</div>} listSlot={<div>LIST-HERE</div>} />);
    expect(screen.getByText('FORM-HERE')).toBeInTheDocument();
    expect(screen.getByText('LIST-HERE')).toBeInTheDocument();
  });

  it('exposes two section landmarks for form and list', () => {
    render(<PopupTemplate formSlot={<div>f</div>} listSlot={<div>l</div>} />);
    expect(screen.getByRole('region', { name: '新しいセッションを開始' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '稼働中のセッション' })).toBeInTheDocument();
  });
});
