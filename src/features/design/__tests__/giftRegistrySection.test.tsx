import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GiftRegistrySectionEditor } from '@/features/design/components/editors/GiftRegistrySectionEditor';
import { InvitationRenderer } from '@/features/design/components/InvitationRenderer';
import { GiftRegistrySection } from '@/features/design/components/sections/GiftRegistrySection';
import { createStarterInvitationDocument } from '@/features/design/registry/sectionRegistry';
import {
  type GiftRegistrySectionContent,
  giftRegistrySectionContentSchema,
  type InvitationWeddingMetadata,
} from '@/features/design/schemas/designSchemas';

const SAMPLE_WEDDING: InvitationWeddingMetadata = {
  title: 'Darwin & Manilyn Wedding',
  partnerOneName: 'Darwin',
  partnerTwoName: 'Manilyn',
  slug: 'darwin-manilyn',
  eventDate: '2026-12-19',
  venueName: 'Manila Cathedral',
  venueLocation: 'Intramuros, Manila',
  timezone: 'Asia/Manila',
  rsvpDeadline: '2026-12-01T23:59:59+08:00',
  isRsvpOpen: true,
};

const SAMPLE_GIFT_CONTENT: GiftRegistrySectionContent = {
  eyebrow: 'A Day Full of Love',
  heading: "We can't wait to celebrate with you",
  introMessage:
    "Your presence will add joy to this beautiful occasion. Thank you for being part of Darwin and Manilyn's special day.",
  noteEyebrow: 'A Note from the Couple',
  noteHeading: 'With all that we have, we are truly blessed.',
  noteMessage:
    'Your presence and prayers are more than enough. However, for those who wish to give a monetary gift, it would be greatly appreciated.',
  accounts: [
    {
      id: 'gcash-1',
      providerName: 'GCash',
      accountLabel: 'GCash Number',
      accountNumber: '09517926285',
      accountHolderName: 'Manilyn Micabalo',
      qrCodeImageUrl: 'https://example.com/gcash-qr.png',
      qrHeading: 'Scan to Send a Monetary Gift',
      instructionsTitle: 'How to Send Your Gift',
      instructions:
        '1. Open your GCash app.\n2. Tap Scan QR.\n3. Scan the QR code above.\n4. Check the recipient details before confirming.',
      disclaimer: 'Please make sure the recipient name is correct before sending.',
    },
  ],
  showReturnToTop: true,
  returnToTopLabel: 'Return to the Invitation',
};

describe('GiftRegistrySection & Schema', () => {
  it('renders the couple note, account details, QR code, numbered instructions, and return button', () => {
    render(<GiftRegistrySection content={SAMPLE_GIFT_CONTENT} ornamentStyle="minimal_line" />);

    expect(screen.getByTestId('invitation-section-gift_registry')).toBeInTheDocument();
    expect(screen.getByText('A Day Full of Love')).toBeInTheDocument();
    expect(screen.getByText("We can't wait to celebrate with you")).toBeInTheDocument();
    expect(screen.getByText('With all that we have, we are truly blessed.')).toBeInTheDocument();
    expect(screen.getByTestId('gift-account-number')).toHaveTextContent('09517926285');
    expect(screen.getByText('Manilyn Micabalo')).toBeInTheDocument();

    const qrImg = screen.getByTestId('gift-qr-image');
    expect(qrImg).toHaveAttribute('src', 'https://example.com/gcash-qr.png');

    // Leading "1. " prefixes should be stripped so <ol> doesn't double-number them
    expect(screen.getByText('Open your GCash app.')).toBeInTheDocument();
    expect(screen.getByText('Check the recipient details before confirming.')).toBeInTheDocument();
    expect(
      screen.getByText('Please make sure the recipient name is correct before sending.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('gift-return-to-top-button')).toBeInTheDocument();
  });

  it('switches between multiple payment accounts via tabs', async () => {
    const user = userEvent.setup();
    const multiAccountContent: GiftRegistrySectionContent = {
      ...SAMPLE_GIFT_CONTENT,
      accounts: [
        ...SAMPLE_GIFT_CONTENT.accounts,
        {
          id: 'bpi-2',
          providerName: 'BPI',
          accountLabel: 'BPI Account Number',
          accountNumber: '1234-5678-90',
          accountHolderName: 'Darwin Reyes',
          qrCodeImageUrl: 'https://example.com/bpi-qr.png',
          qrHeading: 'Scan to Send via BPI',
          instructionsTitle: 'How to Send via BPI',
          instructions: 'Open BPI app.\nScan the QR code above.',
          disclaimer: 'Double-check account details before transferring.',
        },
      ],
    };

    render(<GiftRegistrySection content={multiAccountContent} ornamentStyle="minimal_line" />);

    expect(screen.getByTestId('gift-account-number')).toHaveTextContent('09517926285');
    await user.click(screen.getByTestId('gift-account-tab-bpi-2'));

    expect(screen.getByTestId('gift-account-number')).toHaveTextContent('1234-5678-90');
    expect(screen.getByText('Darwin Reyes')).toBeInTheDocument();
    expect(screen.getByTestId('gift-qr-image')).toHaveAttribute(
      'src',
      'https://example.com/bpi-qr.png',
    );
  });

  it('renders gift_registry inside InvitationRenderer when enabled', () => {
    const starterDoc = createStarterInvitationDocument({ wedding: SAMPLE_WEDDING });
    const docWithGiftVisible = {
      ...starterDoc,
      sections: starterDoc.sections.map((section) =>
        section.sectionType === 'gift_registry'
          ? { ...section, isVisible: true, content: SAMPLE_GIFT_CONTENT }
          : section,
      ),
    };

    render(<InvitationRenderer document={docWithGiftVisible} />);
    expect(screen.getByTestId('invitation-section-gift_registry')).toBeInTheDocument();
    expect(screen.getByTestId('gift-account-number')).toHaveTextContent('09517926285');
  });

  it('rejects unsafe QR URLs and script payloads in schema validation', () => {
    const badQrResult = giftRegistrySectionContentSchema.safeParse({
      ...SAMPLE_GIFT_CONTENT,
      accounts: [
        {
          ...SAMPLE_GIFT_CONTENT.accounts[0],
          qrCodeImageUrl: 'javascript:alert(1)',
        },
      ],
    });
    expect(badQrResult.success).toBe(false);

    const httpQrResult = giftRegistrySectionContentSchema.safeParse({
      ...SAMPLE_GIFT_CONTENT,
      accounts: [
        {
          ...SAMPLE_GIFT_CONTENT.accounts[0],
          qrCodeImageUrl: 'http://insecure.example.com/qr.png',
        },
      ],
    });
    expect(httpQrResult.success).toBe(false);

    const xssInstructionsResult = giftRegistrySectionContentSchema.safeParse({
      ...SAMPLE_GIFT_CONTENT,
      accounts: [
        {
          ...SAMPLE_GIFT_CONTENT.accounts[0],
          instructions: '<script>alert(1)</script>',
        },
      ],
    });
    expect(xssInstructionsResult.success).toBe(false);
  });

  it('allows organizers to edit gift details and add a new payment channel in GiftRegistrySectionEditor', async () => {
    const user = userEvent.setup();
    const onValidChange = vi.fn();
    const onValidationIssue = vi.fn();

    render(
      <GiftRegistrySectionEditor
        content={SAMPLE_GIFT_CONTENT}
        canEdit={true}
        onValidChange={onValidChange}
        onValidationIssue={onValidationIssue}
      />,
    );

    const numberInput = screen.getByTestId('gift-account-number-input-0');
    await user.clear(numberInput);
    await user.type(numberInput, '09170001111');

    expect(onValidChange).toHaveBeenCalled();
    const lastCall = onValidChange.mock.calls.at(-1)?.[0] as GiftRegistrySectionContent;
    expect(lastCall.accounts[0]?.accountNumber).toBe('09170001111');

    await user.click(screen.getByTestId('add-gift-account-button'));
    expect(screen.getByTestId('gift-account-editor-1')).toBeInTheDocument();
  });
});
