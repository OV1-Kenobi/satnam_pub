import { describe, it, expect } from 'vitest';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { IdentityForgeIntegration } from '../src/components/auth/AuthIntegration';

function DummyForge(props: any) {
  return (
    <div>
      <div data-testid="initialMigrationMode">{props.initialMigrationMode || ''}</div>
    </div>
  );
}

describe('AuthIntegration deep-linking for migration mode', () => {
  it('passes initialMigrationMode="import" to child when ?mode=migration is present', async () => {
    render(
      <MemoryRouter initialEntries={["/register?mode=migration"]}>
        <IdentityForgeIntegration>
          <DummyForge />
        </IdentityForgeIntegration>
      </MemoryRouter>
    );

    const el = await screen.findByTestId('initialMigrationMode');
    expect(el.textContent).toBe('import');
  });

  it('does not set initialMigrationMode when query param is absent', async () => {
    render(
      <MemoryRouter initialEntries={["/register"]}>
        <IdentityForgeIntegration>
          <DummyForge />
        </IdentityForgeIntegration>
      </MemoryRouter>
    );

    const el = await screen.findByTestId('initialMigrationMode');
    expect(el.textContent).toBe('');
  });
});

