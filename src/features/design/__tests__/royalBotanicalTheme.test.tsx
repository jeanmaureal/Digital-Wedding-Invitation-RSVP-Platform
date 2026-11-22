import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvitationRenderer } from '@/features/design/components/InvitationRenderer';
import { createStarterInvitationDocument } from '@/features/design/registry/sectionRegistry';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function buildRoyalBotanicalDoc() {
  const base = createStarterInvitationDocument({
    presetId: 'royal_botanical',
    dressCode: 'Dress in Comfort & Joy',
    wedding: {
      title: 'Sherwin & Jelly',
      partnerOneName: 'Sherwin',
      partnerTwoName: 'Jelly',
      slug: 'sherwin-jelly-2027',
      eventDate: '2027-01-25',
      venueName: "La Terrazzas by Loiza's",
      venueLocation: 'Malaybalay City, Bukidnon',
      timezone: 'Asia/Manila',
      rsvpDeadline: '2026-12-20T15:59:00.000Z',
      isRsvpOpen: true,
    },
  });

  return {
    ...base,
    sections: base.sections.map((section) => {
      if (section.sectionType === 'dress_code') {
        return {
          ...section,
          isVisible: true,
          content: {
            ...section.content,
            swatchHexes: ['#3E4C30', '#7E8E72', '#DDD6C3', '#EFE094'],
          },
        };
      }
      if (section.sectionType === 'venue_travel') {
        return {
          ...section,
          content: {
            ...section.content,
            mapUrl: 'https://maps.google.com/?q=Malaybalay+City+Bukidnon',
          },
        };
      }
      return section;
    }),
  };
}

describe('Royal Botanical Envelope Theme (<InvitationRenderer />)', () => {
  it('renders the interactive envelope cover on page mode, transitions smoothly into the detailed letter view, and allows replaying the envelope', () => {
    vi.useFakeTimers();
    const doc = buildRoyalBotanicalDoc();

    render(
      <InvitationRenderer
        document={doc}
        viewportMode="desktop"
        backdropMode="page"
        household={{ displayName: 'The Reyes Family', maxAttendees: 2 }}
      />,
    );

    // 1. Starts in closed envelope state
    const stage = screen.getByTestId('royal-botanical-envelope-stage');
    expect(stage).toHaveAttribute('data-envelope-phase', 'closed');
    expect(screen.getByTestId('envelope-household-greeting')).toHaveTextContent(
      'Prepared for The Reyes Family',
    );
    expect(screen.getByText(/S&J/)).toBeInTheDocument();
    expect(screen.queryByTestId('royal-botanical-letter-view')).not.toBeInTheDocument();

    // 2. Click envelope -> smooth opening -> sliding -> zooming -> full detailed page
    fireEvent.click(screen.getByTestId('royal-botanical-envelope-button'));
    expect(screen.getByTestId('royal-botanical-envelope-stage')).toHaveAttribute(
      'data-envelope-phase',
      'opening',
    );

    act(() => {
      vi.advanceTimersByTime(550);
    });
    expect(screen.getByTestId('royal-botanical-envelope-stage')).toHaveAttribute(
      'data-envelope-phase',
      'sliding',
    );

    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(screen.getByTestId('royal-botanical-envelope-stage')).toHaveAttribute(
      'data-envelope-phase',
      'zooming',
    );

    act(() => {
      vi.advanceTimersByTime(600);
    });

    // 3. Detailed letter page is now revealed
    expect(screen.getByTestId('royal-botanical-letter-view')).toBeInTheDocument();
    expect(screen.getByTestId('royal-botanical-topbar')).toBeInTheDocument();
    expect(screen.getByTestId('invitation-hero-headline')).toHaveTextContent('Sherwin');
    expect(screen.getByTestId('invitation-hero-headline')).toHaveTextContent('Jelly');
    expect(screen.getByTestId('rb-reserved-seats-pill')).toHaveTextContent(
      'WE HAVE RESERVED 2 SEATS IN YOUR HONOR',
    );
    expect(screen.getByTestId('rb-countdown-rings')).toBeInTheDocument();
    expect(screen.getByTestId('royal-botanical-footer')).toHaveTextContent('Sherwin & Jelly');
    expect(screen.getByTestId('royal-botanical-footer')).toHaveTextContent('JANUARY 25, 2027');

    // 4. Clicking ENVELOPE in the top bar replays the closed envelope
    fireEvent.click(screen.getByTestId('royal-botanical-replay-envelope'));
    expect(screen.getByTestId('royal-botanical-envelope-stage')).toHaveAttribute(
      'data-envelope-phase',
      'closed',
    );
  });
});
