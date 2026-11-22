import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RichMarkdownText } from '@/features/design/components/sections/RichMarkdownText';

describe('RichMarkdownText (XSS-safe inline & multiline Markdown)', () => {
  it('renders bold, italic, bold-italic, strikethrough, highlight, and safe https links', () => {
    const { container } = render(
      <RichMarkdownText text="Strict dress is **not required** — wear *anything* ***joyful***, ~~stiff~~ `pearl` [View Guide](https://example.com/guide)." />,
    );

    expect(container.querySelector('strong')?.textContent).toBe('not required');
    expect(container.querySelector('em')?.textContent).toBe('anything');
    expect(container.querySelector('strong > em')?.textContent).toBe('joyful');
    expect(container.querySelector('del')?.textContent).toBe('stiff');
    expect(screen.getByText('pearl')).toBeInTheDocument();

    const link = screen.getByRole('link', { name: 'View Guide' });
    expect(link).toHaveAttribute('href', 'https://example.com/guide');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('never renders unsafe javascript: or http: links or raw HTML tags', () => {
    const { container } = render(
      <RichMarkdownText text="[bad](javascript:alert(1)) [insecure](http://example.com) <b>raw</b>" />,
    );

    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain('<b>raw</b>');
  });

  it('renders multiline paragraphs and bullet lists cleanly', () => {
    const { container } = render(
      <RichMarkdownText
        multiline
        text={'First **paragraph** line.\n\n- **Olive** Green\n- *Butter* Yellow'}
      />,
    );

    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(container.querySelectorAll('ul > li')).toHaveLength(2);
    expect(container.querySelector('ul strong')?.textContent).toBe('Olive');
    expect(container.querySelector('ul em')?.textContent).toBe('Butter');
  });
});
