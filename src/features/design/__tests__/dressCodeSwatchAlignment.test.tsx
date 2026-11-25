import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DressCodeSectionEditor } from '@/features/design/components/editors/DressCodeSectionEditor';
import { InvitationRenderer } from '@/features/design/components/InvitationRenderer';
import { DressCodeSection } from '@/features/design/components/sections/DressCodeSection';
import { createStarterInvitationDocument } from '@/features/design/registry/sectionRegistry';
import type { DressCodeSectionContent } from '@/features/design/schemas/designSchemas';

const baseContent: DressCodeSectionContent = {
  heading: 'Attire & Palette',
  dressCodeTitle: 'Garden Formal',
  guidance: 'Wear breathable fabrics.',
  swatchHexes: ['#3E4C30', '#7E8E72'],
  swatches: [
    { hex: '#3E4C30', label: 'Olive Green', subLabel: 'Rich Botanical' },
    { hex: '#7E8E72', label: 'Sage', subLabel: 'Soft Accent' },
  ],
};

describe('Dress code color swatch alignment', () => {
  it('defaults to center alignment and applies left, center, and right alignment classes in DressCodeSection', () => {
    const { rerender } = render(
      <DressCodeSection content={baseContent} ornamentStyle="minimal_line" />,
    );

    const palette = screen.getByLabelText('Suggested attire color palette');
    expect(palette).toHaveAttribute('data-swatch-alignment', 'center');
    expect(palette.className).toContain('justify-center');

    rerender(
      <DressCodeSection
        content={{ ...baseContent, swatchAlignment: 'left' }}
        ornamentStyle="minimal_line"
      />,
    );
    expect(screen.getByLabelText('Suggested attire color palette')).toHaveAttribute(
      'data-swatch-alignment',
      'left',
    );
    expect(screen.getByLabelText('Suggested attire color palette').className).toContain(
      'justify-start',
    );

    rerender(
      <DressCodeSection
        content={{ ...baseContent, swatchAlignment: 'right' }}
        ornamentStyle="minimal_line"
      />,
    );
    expect(screen.getByLabelText('Suggested attire color palette')).toHaveAttribute(
      'data-swatch-alignment',
      'right',
    );
    expect(screen.getByLabelText('Suggested attire color palette').className).toContain(
      'justify-end',
    );
  });

  it('applies swatch alignment in RoyalBotanicalInvitationView', () => {
    const baseDoc = createStarterInvitationDocument({
      presetId: 'royal_botanical',
      wedding: {
        title: 'Sherwin & Jelly',
        partnerOneName: 'Sherwin',
        partnerTwoName: 'Jelly',
        slug: 'sherwin-jelly',
        eventDate: '2027-01-25',
        venueName: 'Garden Hall',
        venueLocation: 'Manila',
        timezone: 'Asia/Manila',
        rsvpDeadline: null,
        isRsvpOpen: true,
      },
    });

    const doc = {
      ...baseDoc,
      sections: baseDoc.sections.map((section) =>
        section.sectionType === 'dress_code'
          ? {
              ...section,
              isVisible: true,
              content: {
                ...baseContent,
                swatchAlignment: 'right' as const,
              },
            }
          : section,
      ),
    };

    render(<InvitationRenderer document={doc} viewportMode="desktop" backdropMode="frame" />);

    const palette = screen.getByLabelText('Suggested attire color palette');
    expect(palette).toHaveAttribute('data-swatch-alignment', 'right');
    expect(palette.className).toContain('justify-end');
  });

  it('lets the editor switch swatch alignment between center, left, and right', () => {
    const onValidChange = vi.fn();
    const onValidationIssue = vi.fn();

    render(
      <DressCodeSectionEditor
        content={baseContent}
        canEdit={true}
        onValidChange={onValidChange}
        onValidationIssue={onValidationIssue}
      />,
    );

    const select = screen.getByTestId('dress-swatch-alignment-select') as HTMLSelectElement;
    expect(select.value).toBe('center');

    fireEvent.change(select, { target: { value: 'left' } });
    expect(onValidChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ swatchAlignment: 'left' }),
    );

    fireEvent.change(select, { target: { value: 'right' } });
    expect(onValidChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ swatchAlignment: 'right' }),
    );
  });
});
