import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ChannelModal } from '../components/ChannelModal';
import type { Bot } from '../types';

describe('ChannelModal Component', () => {
  const mockBots: Bot[] = [
    {
      id: 'bot_1',
      workspace_id: 'default',
      name: 'Klaus',
      avatar: '👔',
      role_tag: 'Lead',
      description: 'Project orchestrator',
      folder_name: 'Leadership',
      pinned: true,
      is_hidden: false,
      enabled_tools: [],
      individual_memory: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'bot_2',
      workspace_id: 'default',
      name: 'Dev',
      avatar: '💻',
      role_tag: 'Developer',
      description: 'Fullstack engineering',
      folder_name: 'Engineering',
      pinned: true,
      is_hidden: false,
      enabled_tools: [],
      individual_memory: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  ];

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <ChannelModal
        isOpen={false}
        onClose={vi.fn()}
        bots={mockBots}
        onCreateChannel={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders and handles channel creation input', async () => {
    const handleCreate = vi.fn().mockResolvedValue(undefined);
    const handleClose = vi.fn();

    render(
      <ChannelModal
        isOpen={true}
        onClose={handleClose}
        bots={mockBots}
        onCreateChannel={handleCreate}
      />
    );

    expect(screen.getByText('Create Group Channel')).toBeDefined();
    expect(screen.getByText('Klaus')).toBeDefined();
    expect(screen.getByText('Dev')).toBeDefined();

    const nameInput = screen.getByPlaceholderText('leadership, growth-war-room...');
    fireEvent.change(nameInput, { target: { value: 'Design Team' } });

    // Click on bot to select
    const klausBtn = screen.getByText('Klaus').closest('button');
    if (klausBtn) fireEvent.click(klausBtn);

    // Submit form
    const submitBtn = screen.getByText('Create Channel');
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(handleCreate).toHaveBeenCalledWith({
      name: 'design-team',
      description: undefined,
      bot_ids: ['bot_1']
    });
  });

  it('mounts and unmounts repeatedly without React hook call order errors', () => {
    const { rerender, container } = render(
      <ChannelModal
        isOpen={false}
        onClose={vi.fn()}
        bots={mockBots}
        onCreateChannel={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();

    // Toggle open
    rerender(
      <ChannelModal
        isOpen={true}
        onClose={vi.fn()}
        bots={mockBots}
        onCreateChannel={vi.fn()}
      />
    );
    expect(screen.getByText('Create Group Channel')).toBeDefined();

    // Toggle close
    rerender(
      <ChannelModal
        isOpen={false}
        onClose={vi.fn()}
        bots={mockBots}
        onCreateChannel={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
