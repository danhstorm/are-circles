import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { defaultAppState } from '@/lib/settings';
import MusicPanel from '@/components/MusicPanel';
import SetupPanel from '@/components/SetupPanel';

const noop = vi.fn();

describe('panel smoke tests', () => {
  it('renders the music panel as a companion rack surface while keeping core controls', () => {
    render(
      <MusicPanel
        visible
        appState={structuredClone(defaultAppState)}
        editingPreset={0}
        onUpdate={noop}
      />,
    );

    expect(screen.getByTestId('music-panel-shell')).toHaveAttribute('data-panel-style', 'companion-rack');
    expect(screen.getByText('SYNTH')).toBeInTheDocument();
    expect(screen.getByText('Master Volume')).toBeInTheDocument();
    expect(screen.getByText('Pling')).toBeInTheDocument();
    expect(screen.getByText('Plong')).toBeInTheDocument();
  });

  it('renders the setup panel as a companion rack surface while keeping edit controls', () => {
    render(
      <SetupPanel
        visible
        mode="setup"
        onSetMode={noop}
        onClose={noop}
        appState={structuredClone(defaultAppState)}
        editingPreset={0}
        onSetEditingPreset={noop}
        onUpdate={noop}
        onApplyPreset={noop}
        audioActive={false}
        onToggleAudio={noop}
        onTriggerMedia={noop}
        onTriggerMediaByIndex={noop}
        onRemoveMedia={noop}
        onUpdateMediaItem={noop}
        mediaItems={[]}
        activeMediaIndex={-1}
        soundMuted={false}
        onToggleSound={noop}
        onActiveTemplateChange={noop}
        onReorderMedia={noop}
      />,
    );

    expect(screen.getByTestId('setup-panel-shell')).toHaveAttribute('data-panel-style', 'companion-rack');
    expect(screen.getByText('Editing Preset')).toBeInTheDocument();
    expect(screen.getByText('Media')).toBeInTheDocument();
    expect(screen.getByText('Colors (Global)')).toBeInTheDocument();
  });

  it('renders the live card as a companion remote surface', () => {
    render(
      <SetupPanel
        visible
        mode="live"
        onSetMode={noop}
        onClose={noop}
        appState={structuredClone(defaultAppState)}
        editingPreset={0}
        onSetEditingPreset={noop}
        onUpdate={noop}
        onApplyPreset={noop}
        audioActive={false}
        onToggleAudio={noop}
        onTriggerMedia={noop}
        onTriggerMediaByIndex={noop}
        onRemoveMedia={noop}
        onUpdateMediaItem={noop}
        mediaItems={[]}
        activeMediaIndex={-1}
        soundMuted={false}
        onToggleSound={noop}
        onActiveTemplateChange={noop}
        onReorderMedia={noop}
      />,
    );

    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
    expect(screen.getByText('Presentation')).toBeInTheDocument();
  });
});
