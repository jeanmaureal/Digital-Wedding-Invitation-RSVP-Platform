import { DesignDomainError } from '@/features/design/api/designErrors';
import { httpsUrlSchema } from '@/features/design/schemas/designSchemas';
import { getOrganizerSupabaseClient } from '@/lib/supabase/organizerClient';
import type { TypedSupabaseClient } from '@/lib/supabase/publicClient';

export const WEDDING_ASSETS_BUCKET = 'wedding-assets' as const;

export type WeddingAssetCategory = 'backgrounds' | 'fonts' | 'milestones' | 'gifts';

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif']);
const MOTION_VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov']);
const FONT_EXTENSIONS = new Set(['ttf', 'otf', 'woff', 'woff2']);

const MAX_IMAGE_BYTES = 50 * 1024 * 1024; // 50 MiB
const MAX_FONT_BYTES = 15 * 1024 * 1024; // 15 MiB

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
};

export function isVideoAssetUrl(url: string | null | undefined): boolean {
  if (!url) {
    return false;
  }
  const cleanPath = url.split(/[?#]/)[0] ?? '';
  const ext = extractFileExtension(cleanPath);
  return MOTION_VIDEO_EXTENSIONS.has(ext);
}

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
        message: 'Font file must be between 1 byte and 15 MB.',
      };
    }
    return {
      ok: true,
      ext,
      contentType: MIME_BY_EXTENSION[ext] ?? 'font/ttf',
    };
  }

  if (category === 'backgrounds') {
    const isImage = IMAGE_EXTENSIONS.has(ext);
    const isVideo = MOTION_VIDEO_EXTENSIONS.has(ext);
    if (!isImage && !isVideo) {
      return {
        ok: false,
        message:
          'Unsupported background format. Please upload a JPG, PNG, WebP, AVIF, GIF, MP4, WebM, or MOV file.',
      };
    }
    if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
      return {
        ok: false,
        message: 'Background file must be between 1 byte and 50 MB.',
      };
    }
    return {
      ok: true,
      ext,
      contentType: MIME_BY_EXTENSION[ext] ?? file.type ?? (isVideo ? 'video/mp4' : 'image/jpeg'),
    };
  }

  if (!IMAGE_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      message: 'Unsupported image format. Please upload a JPG, PNG, WebP, AVIF, or GIF image.',
    };
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      message: 'Image file must be between 1 byte and 50 MB.',
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
