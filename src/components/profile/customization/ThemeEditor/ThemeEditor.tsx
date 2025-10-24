/**
 * Theme Editor Component
 * Phase 4A: Theme Editor
 * 
 * Main container for profile theme customization
 */

import React from 'react';
import type { ProfileTheme } from '../../../../types/profile';
import { clientConfig } from '../../../../config/env.client';
import { THEME_PRESETS, getDefaultTheme } from '../../../../utils/theme-presets';
import { validateTheme } from '../../../../lib/validation/profile-customization';
import { ColorSchemePicker } from './ColorSchemePicker';
import { TypographySelector } from './TypographySelector';
import { LayoutSelector } from './LayoutSelector';
import { ThemePreview } from './ThemePreview';

interface ThemeEditorProps {
  initialTheme?: ProfileTheme;
  onSave: (theme: ProfileTheme) => Promise<void>;
  onCancel?: () => void;
}

/**
 * Theme Editor Component
 * Provides UI for customizing profile theme with live preview
 */
export function ThemeEditor({ initialTheme, onSave, onCancel }: ThemeEditorProps) {
  // Feature flag check
  if (!clientConfig.flags.profileCustomizationEnabled) {
    return null;
  }

  const [theme, setTheme] = React.useState<ProfileTheme>(
    initialTheme || getDefaultTheme()
  );
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);

  // Track changes
  React.useEffect(() => {
    if (initialTheme) {
      const hasChanges = JSON.stringify(theme) !== JSON.stringify(initialTheme);
      setHasUnsavedChanges(hasChanges);
    }
  }, [theme, initialTheme]);

  const handleColorSchemeChange = (colorScheme: ProfileTheme['colorScheme']) => {
    setTheme({ ...theme, colorScheme });
  };

  const handleTypographyChange = (typography: ProfileTheme['typography']) => {
    setTheme({ ...theme, typography });
  };

  const handleLayoutChange = (layout: ProfileTheme['layout']) => {
    setTheme({ ...theme, layout });
  };

  const handlePresetSelect = (presetId: string) => {
    const preset = THEME_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setTheme(preset.theme);
    }
  };

  const handleReset = () => {
    if (confirm('Reset theme to default? This will discard all customizations.')) {
      setTheme(getDefaultTheme());
    }
  };

  const handleSave = async () => {
    setError(null);

    // Validate theme
    const validation = validateTheme(theme);
    if (!validation.valid) {
      setError(validation.error || 'Invalid theme configuration');
      return;
    }

    setIsSaving(true);
    try {
      await onSave(validation.sanitized!);
      setHasUnsavedChanges(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save theme');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="theme-editor">
      <div className="theme-editor-header">
        <h2 className="editor-title">Customize Your Profile Theme</h2>
        <p className="editor-description">
          Personalize your profile with custom colors, fonts, and layout options
        </p>
      </div>

      {/* Preset Themes */}
      <div className="preset-themes">
        <h3 className="section-title">Preset Themes</h3>
        <div className="preset-grid">
          {THEME_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handlePresetSelect(preset.id)}
              className="preset-card"
              style={{
                background: `linear-gradient(135deg, ${preset.theme.colorScheme.primary}, ${preset.theme.colorScheme.secondary})`,
              }}
            >
              <span className="preset-name">{preset.name}</span>
              <span className="preset-description">{preset.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Theme Customization */}
      <div className="theme-customization">
        <div className="customization-panel">
          <ColorSchemePicker
            colorScheme={theme.colorScheme}
            onChange={handleColorSchemeChange}
          />

          <TypographySelector
            typography={theme.typography}
            onChange={handleTypographyChange}
          />

          <LayoutSelector layout={theme.layout} onChange={handleLayoutChange} />
        </div>

        <div className="preview-panel">
          <ThemePreview theme={theme} />
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Actions */}
      <div className="theme-editor-actions">
        <button
          type="button"
          onClick={handleReset}
          className="action-button secondary"
          disabled={isSaving}
        >
          Reset to Default
        </button>

        <div className="action-group">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="action-button secondary"
              disabled={isSaving}
            >
              Cancel
            </button>
          )}

          <button
            type="button"
            onClick={handleSave}
            className="action-button primary"
            disabled={isSaving || !hasUnsavedChanges}
          >
            {isSaving ? 'Saving...' : 'Save Theme'}
          </button>
        </div>
      </div>

      {hasUnsavedChanges && (
        <p className="unsaved-warning">You have unsaved changes</p>
      )}

      <style>{`
        .theme-editor {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem;
        }

        .theme-editor-header {
          margin-bottom: 2rem;
        }

        .editor-title {
          font-size: 2rem;
          font-weight: 700;
          color: #1f2937;
          margin-bottom: 0.5rem;
        }

        .editor-description {
          font-size: 1rem;
          color: #6b7280;
        }

        .preset-themes {
          margin-bottom: 2rem;
        }

        .section-title {
          font-size: 1.25rem;
          font-weight: 600;
          color: #1f2937;
          margin-bottom: 1rem;
        }

        .preset-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
        }

        .preset-card {
          padding: 2rem 1rem;
          border: none;
          border-radius: 0.5rem;
          color: white;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
          text-align: center;
        }

        .preset-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        }

        .preset-name {
          display: block;
          font-size: 1.125rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
        }

        .preset-description {
          display: block;
          font-size: 0.875rem;
          opacity: 0.9;
        }

        .theme-customization {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
          margin-bottom: 2rem;
        }

        .customization-panel {
          display: flex;
          flex-direction: column;
        }

        .preview-panel {
          position: sticky;
          top: 2rem;
          height: fit-content;
        }

        .error-message {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 0.375rem;
          color: #991b1b;
          margin-bottom: 1.5rem;
        }

        .error-icon {
          font-size: 1.25rem;
        }

        .theme-editor-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 1.5rem;
          border-top: 1px solid #e5e7eb;
        }

        .action-group {
          display: flex;
          gap: 0.75rem;
        }

        .action-button {
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 0.375rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .action-button.primary {
          background: #8b5cf6;
          color: white;
        }

        .action-button.primary:hover:not(:disabled) {
          background: #7c3aed;
        }

        .action-button.secondary {
          background: #f3f4f6;
          color: #374151;
        }

        .action-button.secondary:hover:not(:disabled) {
          background: #e5e7eb;
        }

        .action-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .unsaved-warning {
          text-align: center;
          font-size: 0.875rem;
          color: #f59e0b;
          margin-top: 1rem;
        }

        @media (max-width: 768px) {
          .theme-customization {
            grid-template-columns: 1fr;
          }

          .preview-panel {
            position: static;
          }

          .theme-editor-actions {
            flex-direction: column;
            gap: 1rem;
          }

          .action-group {
            width: 100%;
            flex-direction: column;
          }

          .action-button {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

