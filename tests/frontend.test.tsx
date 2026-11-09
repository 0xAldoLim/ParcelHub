// @vitest-environment jsdom
import React from 'react';
import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { ParcelForm } from '../apps/web/src/components/ParcelForm';
vi.mock('../apps/web/src/lib/offline', () => ({ saveParcel: vi.fn(async () => {}) }));
afterEach(cleanup);
it('requires a courier, suggests known prefixes and explicitly labels synthetic tracking', async () => {
  const user = userEvent.setup();
  render(<ParcelForm open onClose={() => {}} />);
  expect(screen.getByRole('combobox', { name: /Courier/ })).toHaveValue('');
  await user.type(screen.getByRole('textbox', { name: /Tracking number/ }), 'JX1234567');
  expect(screen.getByRole('combobox', { name: /Courier/ })).toHaveValue('jnt');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Tracking source' }), 'mock');
  expect(screen.getByText(/does not describe a real shipment/)).toBeVisible();
});
