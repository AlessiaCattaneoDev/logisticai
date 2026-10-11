import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('mostra il nome del prodotto', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /LogisticAI/i })).toBeInTheDocument();
  });
});
