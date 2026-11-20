import { DesignDomainError } from '@/features/design/api/designErrors';
import { httpsUrlSchema } from '@/features/design/schemas/designSchemas';
import { getOrganizerSupabaseClient } from '@/lib/supabase/organizerClient';
import type { TypedSupabaseClient } from '@/lib/supabase/publicClient';

export const WEDDING_ASSETS_BUCKET = 'wedding-assets' as const;

export type WeddingAssetCategory = 'backgrounds' | 'fonts' | 'milestones';

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif']);
const FONT_EXTENSIONS = new Set(['ttf', 'otf', 'woff', 'woff2']);

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MiB
const MAX_FONT_BYTES = 5 * 1024 * 1024; // 5 MiB

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
};

export interface UploadedWeddingAsset {
  readonly publicUrl: string;
  readonly storagePath: string;
  readonly fileName: string;
}

export function extractFileExtension(fileName: string): string {
  const trimmed = fileName.trim().toLowerCase();
  const lastDot = trimmed.lastIndexOf('.');
  if (lastDot < 0 || lastDot === trimmed.length - 1) {
    return '';
  }
  return trimmed.slice(lastDot + 1);
}

export function deriveFontDisplayName(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^.]+$/, '');
  const cleaned = withoutExt
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || 'Custom Font').slice(0, 60);
}

export function validateWeddingAssetFile(
  file: File,
  category: WeddingAssetCategory,
): { readonly ok: true; readonly ext: string; readonly contentType: string } | { readonly ok: false; readonly message: string } {
  const ext = extractFileExtension(file.name);

  if (category === 'fonts') {
    if (!FONT_EXTENSIONS.has(ext)) {
      return {
        ok: false,
        message: 'Unsupported font format. Please upload a .ttf, .otf, .woff, or .woff2 file.',
      };
    }
    if (file.size <= 0 || file.size > MAX_FONT_BYTES) {
      return {
        ok: false,
        message: 'Font file must be between 1 byte and 5 MB.',
      };
    }
    return {
      ok: true,
      ext,
      contentType: MIME_BY_EXTENSION[ext] ?? 'font/ttf',
    };
  }

  if (!IMAGE_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      message: 'Unsupported image format. Please upload a JPG, PNG, WebP, or AVIF image.',
    };
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      message: 'Image file must be between 1 byte and 8 MB.',
    };
  }

  return {
    ok: true,
    ext,
    contentType: MIME_BY_EXTENSION[ext] ?? file.type ?? 'image/jpeg',
  };
}

function generateAssetUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function uploadWeddingDesignAsset(
  params: {
    readonly workspaceId: string;
    readonly weddingId: string;
    readonly category: WeddingAssetCategory;
    readonly file: File;
  },
  client: TypedSupabaseClient | null = getOrganizerSupabaseClient(),
): Promise<UploadedWeddingAsset> {
  if (!client) {
    throw new DesignDomainError(
      'UNCONFIGURED',
      'Supabase storage is not configured in this offline environment.',
    );
  }

  const validation = validateWeddingAssetFile(params.file, params.category);
  if (!validation.ok) {
    throw new DesignDomainError('SCHEMA_VALIDATION_FAILED', validation.message);
  }

  const storagePath = `${params.workspaceId}/${params.weddingId}/${params.category}/${generateAssetUuid()}.${validation.ext}`;

  const { error: uploadError } = await client.storage
    .from(WEDDING_ASSETS_BUCKET)
    .upload(storagePath, params.file, {
      contentType: validation.contentType,
      cacheControl: '31536000',
      upsert: false,
    });

  if (uploadError) {
    throw new DesignDomainError(
      'UNKNOWN',
      uploadError.message || 'Unable to upload asset to storage. Please try again.',
    );
  }

  const { data: urlData } = client.storage
    .from(WEDDING_ASSETS_BUCKET)
    .getPublicUrl(storagePath);

  const parsedUrl = httpsUrlSchema.safeParse(urlData?.publicUrl ?? '');
  if (!parsedUrl.success) {
    throw new DesignDomainError(
      'SCHEMA_VALIDATION_FAILED',
      'Uploaded asset did not produce a valid https:// public URL.',
    );
  }

  return {
    publicUrl: parsedUrl.data,
    storagePath,
    fileName: params.file.name,
  };
}
