/**
 * FI-5 TrainerBranding — TRAINER role.
 * Logo upload (multipart, PNG/JPG/SVG ≤2MB) + color picker with live preview.
 * Live preview via BrandProvider (--brand-primary updates instantly, contrast-guarded).
 * GET/PUT /trainers/me/branding, POST /trainers/me/branding/logo
 */
import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { brandingApi, type BrandingResponseDto } from '@/api/endpoints/branding';
import { Button } from '@/components/ui/Button';
import { useBrand } from '@/providers/brand-provider';
import { ApiError } from '@/api/errors';

const BRANDING_KEY = ['trainers', 'me', 'branding'] as const;

// Accepted logo MIME types
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'];
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

// ─── Color validation ─────────────────────────────────────────────────────────

function isValidHex(hex: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(hex);
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TrainerBranding() {
  const qc = useQueryClient();
  const { setBrand } = useBrand();

  const [primaryColor, setPrimaryColor] = useState('#00B300');
  const [colorInput, setColorInput] = useState('#00B300');
  const [colorError, setColorError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: BRANDING_KEY,
    queryFn: brandingApi.get,
  });

  // Populate from server
  useEffect(() => {
    if (data) {
      setPrimaryColor(data.primaryColorHex);
      setColorInput(data.primaryColorHex);
      setIsDirty(false);
      if (data.logoUrl) {
        setLogoPreview(data.logoUrl);
      }
    }
  }, [data]);

  // Live preview — update BrandProvider on each valid color change
  useEffect(() => {
    if (isValidHex(primaryColor)) {
      setBrand(primaryColor);
    }
  }, [primaryColor, setBrand]);

  // Cleanup brand preview on unmount
  useEffect(() => {
    return () => {
      if (data?.primaryColorHex) {
        setBrand(data.primaryColorHex);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMutation = useMutation({
    mutationFn: () =>
      brandingApi.update({
        primaryColorHex: primaryColor,
        logoUrl: logoPreview ?? undefined,
      }),
    onSuccess: (updated) => {
      qc.setQueryData(BRANDING_KEY, updated);
      setIsDirty(false);
      setSaveMessage('Branding saved');
      setSaveError(null);
      setTimeout(() => setSaveMessage(null), 3000);
    },
    onError: (err) => {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to save branding');
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => brandingApi.uploadLogo(file),
    onSuccess: ({ logoUrl }) => {
      setLogoPreview(logoUrl);
      setUploadError(null);
      setIsDirty(true);
    },
    onError: (err) => {
      setUploadError(err instanceof ApiError ? err.message : 'Upload failed');
    },
  });

  const handleColorInputChange = (val: string) => {
    setColorInput(val);
    if (isValidHex(val)) {
      setPrimaryColor(val);
      setColorError(null);
      setIsDirty(true);
    } else {
      setColorError('Enter a valid hex color (e.g. #1E88E5)');
    }
  };

  const handleColorPickerChange = (val: string) => {
    setColorInput(val);
    setPrimaryColor(val);
    setColorError(null);
    setIsDirty(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setUploadError('Only PNG, JPG, and SVG files are accepted');
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setUploadError('File must be smaller than 2MB');
      return;
    }

    setUploadError(null);
    uploadMutation.mutate(file);
  };

  return (
    <main
      role="main"
      style={{ padding: 'var(--space-xl)', backgroundColor: 'var(--bg)', minHeight: '100svh' }}
    >
      {/* Header */}
      <div style={{ marginBottom: 'var(--space-xl)' }}>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-eyebrow)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontWeight: 600,
            color: 'var(--muted)',
            marginBottom: 'var(--space-xxs)',
          }}
        >
          Trainer
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-hero)',
            fontWeight: 700,
            color: 'var(--ink)',
            margin: 0,
            lineHeight: '38px',
          }}
        >
          Branding
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-body)',
            color: 'var(--text-secondary)',
            marginTop: 'var(--space-xs)',
          }}
        >
          Customize your portal appearance. Changes are previewed live.
        </p>
      </div>

      {isLoading && (
        <div role="status" aria-label="Loading branding">
          <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-body)' }}>
            Loading branding settings…
          </span>
        </div>
      )}

      {!isLoading && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--space-xl)',
          }}
        >
          {/* Settings panel */}
          <div
            style={{
              backgroundColor: 'var(--surface)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-card-soft)',
              border: '1px solid var(--border-soft)',
              padding: 'var(--space-xl)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-lg)',
            }}
          >
            {/* Logo upload */}
            <section aria-labelledby="logo-heading">
              <h2
                id="logo-heading"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-card)',
                  fontWeight: 600,
                  color: 'var(--ink)',
                  margin: '0 0 var(--space-md)',
                }}
              >
                Logo
              </h2>

              {/* Current logo preview */}
              <div
                style={{
                  width: '120px',
                  height: '60px',
                  backgroundColor: 'var(--bg)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-soft)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 'var(--space-sm)',
                  overflow: 'hidden',
                }}
              >
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="Current logo"
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 'var(--text-eyebrow)',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      color: 'var(--muted)',
                      letterSpacing: '0.05em',
                    }}
                  >
                    No Logo
                  </span>
                )}
              </div>

              {/* Upload button */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  onChange={handleFileChange}
                  aria-label="Upload logo"
                  style={{ display: 'none' }}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  loading={uploadMutation.isPending}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadMutation.isPending ? 'Uploading…' : 'Upload Logo'}
                </Button>
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--text-caption)',
                    color: 'var(--muted)',
                    marginTop: 'var(--space-xxs)',
                  }}
                >
                  PNG, JPG, or SVG · max 2MB
                </p>
                {uploadError && (
                  <div
                    role="alert"
                    aria-live="polite"
                    style={{
                      color: 'var(--danger)',
                      fontFamily: 'var(--font-body)',
                      fontSize: 'var(--text-caption)',
                      marginTop: 'var(--space-xxs)',
                    }}
                  >
                    {uploadError}
                  </div>
                )}
              </div>
            </section>

            {/* Color picker */}
            <section aria-labelledby="color-heading">
              <h2
                id="color-heading"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-card)',
                  fontWeight: 600,
                  color: 'var(--ink)',
                  margin: '0 0 var(--space-md)',
                }}
              >
                Brand Color
              </h2>

              <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                {/* Native color picker */}
                <label htmlFor="colorPicker" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                  <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
                    Pick brand color
                  </span>
                  <input
                    id="colorPicker"
                    type="color"
                    value={primaryColor}
                    onChange={(e) => handleColorPickerChange(e.target.value)}
                    aria-label="Pick brand color"
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: 'var(--radius-xs)',
                      border: '1px solid var(--border-soft)',
                      cursor: 'pointer',
                      padding: '2px',
                      backgroundColor: 'var(--surface)',
                    }}
                  />
                </label>

                {/* Hex input */}
                <div style={{ flex: 1 }}>
                  <input
                    id="colorHex"
                    type="text"
                    value={colorInput}
                    onChange={(e) => handleColorInputChange(e.target.value)}
                    aria-label="Brand color hex value"
                    placeholder="#00B300"
                    maxLength={7}
                    style={{
                      width: '100%',
                      height: '40px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-body)',
                      color: 'var(--ink)',
                      backgroundColor: 'var(--surface)',
                      border: colorError ? '1.5px solid var(--danger)' : '1px solid var(--border-soft)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0 10px',
                      outline: 'none',
                    }}
                    aria-invalid={!!colorError}
                    aria-describedby={colorError ? 'color-error' : undefined}
                  />
                  {colorError && (
                    <span
                      id="color-error"
                      role="alert"
                      style={{
                        display: 'block',
                        marginTop: '0.25rem',
                        fontFamily: 'var(--font-body)',
                        fontSize: 'var(--text-caption)',
                        color: 'var(--danger)',
                      }}
                    >
                      {colorError}
                    </span>
                  )}
                </div>
              </div>
            </section>

            {/* Save */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <Button
                onClick={() => saveMutation.mutate()}
                loading={saveMutation.isPending}
                disabled={!isDirty || !!colorError}
              >
                Save Branding
              </Button>
              {saveMessage && (
                <span
                  aria-live="polite"
                  role="status"
                  style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-body)', color: 'var(--success)' }}
                >
                  {saveMessage}
                </span>
              )}
              {saveError && (
                <span
                  aria-live="polite"
                  role="alert"
                  style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-body)', color: 'var(--danger)' }}
                >
                  {saveError}
                </span>
              )}
            </div>
          </div>

          {/* Live preview panel */}
          <div
            aria-label="Live brand preview"
            style={{
              backgroundColor: 'var(--surface)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-card-soft)',
              border: '1px solid var(--border-soft)',
              padding: 'var(--space-xl)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-lg)',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-eyebrow)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontWeight: 600,
                color: 'var(--muted)',
              }}
            >
              Live Preview
            </div>

            {/* Brand color swatch */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
              <div
                role="img"
                aria-label="Brand color swatch"
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--brand-primary)',
                  boxShadow: 'var(--shadow-btn-primary)',
                  flexShrink: 0,
                }}
              />
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--text-body)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Primary color
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-body)',
                    color: 'var(--ink)',
                    fontWeight: 600,
                  }}
                >
                  {primaryColor}
                </div>
              </div>
            </div>

            {/* Preview button */}
            <div>
              <button
                type="button"
                aria-label="Preview primary button"
                style={{
                  padding: '10px 24px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'linear-gradient(135deg, var(--brand-primary-soft), var(--brand-primary-deep))',
                  color: '#FFFFFF',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 600,
                  fontSize: 'var(--text-body)',
                  border: 'none',
                  cursor: 'default',
                  boxShadow: 'var(--shadow-btn-primary)',
                }}
              >
                Preview Button
              </button>
            </div>

            {/* Logo preview */}
            {logoPreview && (
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--text-caption)',
                    color: 'var(--muted)',
                    marginBottom: 'var(--space-xs)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontWeight: 600,
                  }}
                >
                  Logo
                </div>
                <img
                  src={logoPreview}
                  alt="Logo preview"
                  style={{ maxWidth: '200px', maxHeight: '80px', objectFit: 'contain' }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
