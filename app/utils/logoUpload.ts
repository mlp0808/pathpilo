export const LOGO_MAX_BYTES = 4 * 1024 * 1024
export const LOGO_ACCEPT_ATTR = 'image/png,image/jpeg,image/webp'
export const LOGO_ACCEPT_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])

export type LogoUploadError = {
  title: string
  details: string[]
}

type Translate = (key: string, fallback: string) => string

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name || '')
  return (m?.[1] || '').toLowerCase()
}

/** Client-side validation before upload — returns a structured error or null. */
export function validateLogoFile(
  file: File,
  t: Translate,
): LogoUploadError | null {
  if (file.size > LOGO_MAX_BYTES) {
    const mb = (LOGO_MAX_BYTES / (1024 * 1024)).toFixed(0)
    return {
      title: t('settings.business.logo.errorTitle', "Logo couldn't be uploaded"),
      details: [
        t('settings.business.logo.tooLarge', `File is too large — maximum size is ${mb} MB.`),
        t('settings.business.logo.tooLargeTip', 'Try exporting a smaller PNG or JPG, or resize the image first.'),
      ],
    }
  }

  const mime = (file.type || '').toLowerCase()
  const ext = extOf(file.name)

  if (LOGO_ACCEPT_MIME.has(mime)) return null

  const details: string[] = [
    t(
      'settings.business.logo.formatsAllowed',
      'Accepted formats: PNG, JPG, or WEBP.',
    ),
  ]

  if (ext === 'heic' || ext === 'heif' || mime.includes('heic') || mime.includes('heif')) {
    details.unshift(
      t(
        'settings.business.logo.heicHint',
        'iPhone photos are often saved as HEIC, which is not supported.',
      ),
      t(
        'settings.business.logo.heicFix',
        'Save as JPG/PNG (e.g. AirDrop to a computer, or use a free converter), then upload again.',
      ),
    )
  } else if (ext === 'svg' || mime === 'image/svg+xml') {
    details.unshift(
      t(
        'settings.business.logo.svgNotAllowed',
        'SVG files are not accepted for security reasons.',
      ),
    )
  } else if (ext === 'gif' || mime === 'image/gif') {
    details.unshift(
      t('settings.business.logo.gifNotAllowed', 'GIF files are not supported — please use PNG or JPG.'),
    )
  } else if (ext === 'pdf' || mime === 'application/pdf') {
    details.unshift(
      t('settings.business.logo.pdfNotAllowed', 'PDF files cannot be used as a logo — export a PNG or JPG instead.'),
    )
  } else {
    details.unshift(
      t(
        'settings.business.logo.unsupportedType',
        `“${file.name || 'This file'}” is not a supported image type.`,
      ),
    )
  }

  return {
    title: t('settings.business.logo.errorTitle', "Logo couldn't be uploaded"),
    details,
  }
}

/** Map API / network errors to a clearer message for users. */
export function mapLogoServerError(
  raw: string,
  t: Translate,
): LogoUploadError {
  const msg = String(raw || '').trim()
  const lower = msg.toLowerCase()

  if (lower.includes('only png') || lower.includes('webp') || lower.includes('svg')) {
    return {
      title: t('settings.business.logo.errorTitle', "Logo couldn't be uploaded"),
      details: [
        t(
          'settings.business.logo.formatsAllowed',
          'Accepted formats: PNG, JPG, or WEBP.',
        ),
        t(
          'settings.business.logo.svgNotAllowed',
          'SVG files are not accepted for security reasons.',
        ),
      ],
    }
  }

  if (lower.includes('too large') || lower.includes('file size') || lower.includes('4 mb')) {
    return validateLogoFile(
      { name: 'logo.png', type: 'image/png', size: LOGO_MAX_BYTES + 1 } as File,
      t,
    )!
  }

  if (lower.includes('no file')) {
    return {
      title: t('settings.business.logo.errorTitle', "Logo couldn't be uploaded"),
      details: [
        t('settings.business.logo.noFile', 'No file was received — please choose an image and try again.'),
      ],
    }
  }

  return {
    title: t('settings.business.logo.errorTitle', "Logo couldn't be uploaded"),
    details: [
      msg || t('settings.business.logo.uploadFailed', 'Upload failed. Please try again.'),
      t(
        'settings.business.logo.uploadFailedTip',
        'If the problem continues, try a different browser or a smaller PNG/JPG file.',
      ),
    ],
  }
}
