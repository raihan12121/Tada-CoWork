import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BotModal } from '../components/BotModal';
import type { Bot } from '../types';

describe('BotModal Component', () => {
  const existingBot: Bot = {
    id: 'bot_motion',
    workspace_id: 'default',
    name: 'Motion',
    avatar: '🎬',
    role_tag: 'Video & Animation',
    description: 'Generates animated charts and renders timelines.',
    folder_name: 'Marketing',
    pinned: true,
    is_hidden: false,
    enabled_tools: ['doc_gen'],
    individual_memory: ['Render in 4k'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <BotModal
        isOpen={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders create mode with default fields when no bot is provided', () => {
    render(
      <BotModal
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByText('Create New Specialist Bot')).toBeDefined();
    expect(screen.getByPlaceholderText('e.g. Klaus, Dev, Motion...')).toBeDefined();
  });

  it('renders edit mode pre-populated with existing bot data', () => {
    render(
      <BotModal
        isOpen={true}
        bot={existingBot}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByText('Edit Motion')).toBeDefined();
    const nameInput = screen.getByDisplayValue('Motion') as HTMLInputElement;
    expect(nameInput.value).toBe('Motion');
    expect(screen.getByText('Render in 4k')).toBeDefined();
  });

  it('toggles open and closed state without crashing React 19 hook order', () => {
    const { rerender, container } = render(
      <BotModal
        isOpen={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();

    rerender(
      <BotModal
        isOpen={true}
        bot={existingBot}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(screen.getByText('Edit Motion')).toBeDefined();

    rerender(
      <BotModal
        isOpen={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
