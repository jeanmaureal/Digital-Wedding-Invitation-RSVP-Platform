import { Fragment, type JSX, type ReactNode } from 'react';

export interface RichMarkdownTextProps {
  readonly text: string;
  /**
   * When true, double newlines (`\n\n`) create paragraphs, single newlines (`\n`)
   * insert `<br />`, and lines prefixed with `- ` or `* ` render as bullet lists.
   * When false (default), renders inline formatting only (safe inside `<p>`, `<h1>`, `<span>`).
   */
  readonly multiline?: boolean | undefined;
  readonly className?: string | undefined;
}

function isSafeHttpsUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Pure-React, XSS-safe inline Markdown parser (zero `dangerouslySetInnerHTML`).
 * Supports:
 *   - `***bold italic***` / `___bold italic___`
 *   - `**bold**` / `__bold__`
 *   - `*italic*` / `_italic_`
 *   - `~~strikethrough~~`
 *   - `` `accent highlight` ``
 *   - `[label](https://...)` (https:// URLs only)
 */
function renderInlineMarkdown(input: string, keyPrefix = 'md'): ReactNode[] {
  if (!input) {
    return [];
  }

  const tokenRegex =
    /(\*\*\*[^*\n]+?\*\*\*|___[^_\n]+?___|\*\*[^*\n]+?\*\*|__[^_\n]+?__|~~[^~\n]+?~~|`[^`\n]+?`|\[[^\]\n]+?\]\(https:\/\/[^\s)]+\)|\*[^*\s][^*\n]*?\*|(?<![A-Za-z0-9])_[^_\s][^_\n]*?_(?![A-Za-z0-9]))/g;

  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null = tokenRegex.exec(input);
  let partIdx = 0;

  while (match !== null) {
    if (match.index > lastIndex) {
      nodes.push(input.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${keyPrefix}-${partIdx}`;
    partIdx += 1;

    if (
      (token.startsWith('***') && token.endsWith('***')) ||
      (token.startsWith('___') && token.endsWith('___'))
    ) {
      const inner = token.slice(3, -3);
      nodes.push(
        <strong key={key} className="font-semibold">
          <em className="italic">{renderInlineMarkdown(inner, `${key}-bi`)}</em>
        </strong>,
      );
    } else if (
      (token.startsWith('**') && token.endsWith('**')) ||
      (token.startsWith('__') && token.endsWith('__'))
    ) {
      const inner = token.slice(2, -2);
      nodes.push(
        <strong key={key} className="font-semibold" style={{ color: 'var(--inv-ink, inherit)' }}>
          {renderInlineMarkdown(inner, `${key}-b`)}
        </strong>,
      );
    } else if (token.startsWith('~~') && token.endsWith('~~')) {
      const inner = token.slice(2, -2);
      nodes.push(
        <del key={key} className="opacity-75">
          {renderInlineMarkdown(inner, `${key}-d`)}
        </del>,
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      const inner = token.slice(1, -1);
      nodes.push(
        <span
          key={key}
          className="rounded px-1 py-0.5 font-medium"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--inv-accent, #C2A65A) 14%, transparent)',
            color: 'var(--inv-ink, inherit)',
          }}
        >
          {inner}
        </span>,
      );
    } else if (token.startsWith('[')) {
      const linkMatch = /^\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)$/.exec(token);
      if (linkMatch && linkMatch[1] && linkMatch[2] && isSafeHttpsUrl(linkMatch[2])) {
        nodes.push(
          <a
            key={key}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 transition-opacity hover:opacity-80"
            style={{ color: 'var(--inv-accent, inherit)' }}
          >
            {renderInlineMarkdown(linkMatch[1], `${key}-a`)}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    } else if (
      (token.startsWith('*') && token.endsWith('*')) ||
      (token.startsWith('_') && token.endsWith('_'))
    ) {
      const inner = token.slice(1, -1);
      nodes.push(
        <em key={key} className="italic">
          {renderInlineMarkdown(inner, `${key}-i`)}
        </em>,
      );
    } else {
      nodes.push(token);
    }

    lastIndex = match.index + token.length;
    match = tokenRegex.exec(input);
  }

  if (lastIndex < input.length) {
    nodes.push(input.slice(lastIndex));
  }

  return nodes;
}

function renderLinesWithBreaks(block: string, keyPrefix: string): ReactNode[] {
  const lines = block.split(/\r?\n/);
  return lines.map((line, idx) => (
    <Fragment key={`${keyPrefix}-line-${idx}`}>
      {idx > 0 ? <br /> : null}
      {renderInlineMarkdown(line, `${keyPrefix}-l${idx}`)}
    </Fragment>
  ));
}

export function RichMarkdownText({
  text,
  multiline = false,
  className,
}: RichMarkdownTextProps): JSX.Element {
  if (!multiline) {
    return <>{renderInlineMarkdown(text)}</>;
  }

  const rawBlocks = text
    .split(/\r?\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  if (rawBlocks.length === 0) {
    return <></>;
  }

  return (
    <div className={className ?? 'space-y-3'}>
      {rawBlocks.map((block, blockIdx) => {
        const lines = block.split(/\r?\n/);
        const isBulletList = lines.every((line) => /^[-*]\s+/.test(line.trim()));

        if (isBulletList) {
          return (
            <ul key={`blk-${blockIdx}`} className="list-disc space-y-1 pl-5 text-left">
              {lines.map((line, itemIdx) => (
                <li key={`li-${blockIdx}-${itemIdx}`}>
                  {renderInlineMarkdown(line.trim().replace(/^[-*]\s+/, ''), `li-${blockIdx}-${itemIdx}`)}
                </li>
              ))}
            </ul>
          );
        }

        return <p key={`blk-${blockIdx}`}>{renderLinesWithBreaks(block, `p-${blockIdx}`)}</p>;
      })}
    </div>
  );
}
