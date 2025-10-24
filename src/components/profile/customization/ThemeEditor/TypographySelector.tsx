/**
 * Typography Selector Component
 * Phase 4A: Theme Editor
 * 
 * Allows users to customize font family and size
 */

import React from 'react';
import type { Typography } from '../../../../types/profile';

interface TypographySelectorProps {
  typography: Typography;
  onChange: (typography: Typography) => void;
}

const FONT_FAMILIES: Array<{ value: Typography['fontFamily']; label: string }> = [
  { value: 'Inter', label: 'Inter (Default)' },
  { value: 'Roboto', label: 'Roboto' },
  { value: 'Open Sans', label: 'Open Sans' },
  { value: 'Lato', label: 'Lato' },
  { value: 'Montserrat', label: 'Montserrat' },
];

const FONT_SIZES: Array<{ value: Typography['fontSize']; label: string; description: string }> = [
  { value: 'small', label: 'Small', description: 'Compact text' },
  { value: 'medium', label: 'Medium', description: 'Standard size' },
  { value: 'large', label: 'Large', description: 'Easy to read' },
];

/**
 * Typography Selector Component
 */
export function TypographySelector({ typography, onChange }: TypographySelectorProps) {
  const handleFontFamilyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...typography,
      fontFamily: e.target.value as Typography['fontFamily'],
    });
  };

  const handleFontSizeChange = (size: Typography['fontSize']) => {
    onChange({
      ...typography,
      fontSize: size,
    });
  };

  return (
    <div className="typography-selector">
      <h3 className="section-title">Typography</h3>
      <p className="section-description">
        Choose the font style and size for your profile
      </p>

      <div className="typography-controls">
        {/* Font Family Selector */}
        <div className="control-group">
          <label htmlFor="font-family" className="control-label">
            Font Family
          </label>
          <select
            id="font-family"
            value={typography.fontFamily}
            onChange={handleFontFamilyChange}
            className="font-family-select"
            style={{ fontFamily: typography.fontFamily }}
          >
            {FONT_FAMILIES.map((font) => (
              <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                {font.label}
              </option>
            ))}
          </select>
          <p className="control-hint">
            Preview: <span style={{ fontFamily: typography.fontFamily }}>The quick brown fox jumps over the lazy dog</span>
          </p>
        </div>

        {/* Font Size Selector */}
        <div className="control-group">
          <label className="control-label">Font Size</label>
          <div className="font-size-options">
            {FONT_SIZES.map((size) => (
              <button
                key={size.value}
                type="button"
                onClick={() => handleFontSizeChange(size.value)}
                className={`font-size-option ${typography.fontSize === size.value ? 'active' : ''}`}
              >
                <span className="option-label">{size.label}</span>
                <span className="option-description">{size.description}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        .typography-selector {
          padding: 1.5rem;
          background: #f9fafb;
          border-radius: 0.5rem;
          margin-bottom: 1.5rem;
        }

        .section-title {
          font-size: 1.25rem;
          font-weight: 600;
          color: #1f2937;
          margin-bottom: 0.5rem;
        }

        .section-description {
          font-size: 0.875rem;
          color: #6b7280;
          margin-bottom: 1.5rem;
        }

        .typography-controls {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .control-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .control-label {
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
        }

        .font-family-select {
          padding: 0.5rem 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 0.375rem;
          font-size: 0.875rem;
          background: white;
          cursor: pointer;
        }

        .font-family-select:focus {
          outline: none;
          border-color: #8b5cf6;
          box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
        }

        .control-hint {
          font-size: 0.75rem;
          color: #9ca3af;
          margin: 0;
        }

        .font-size-options {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.75rem;
        }

        .font-size-option {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 1rem;
          border: 2px solid #d1d5db;
          border-radius: 0.375rem;
          background: white;
          cursor: pointer;
          transition: all 0.2s;
        }

        .font-size-option:hover {
          border-color: #8b5cf6;
          background: #faf5ff;
        }

        .font-size-option.active {
          border-color: #8b5cf6;
          background: #8b5cf6;
          color: white;
        }

        .option-label {
          font-size: 0.875rem;
          font-weight: 600;
          margin-bottom: 0.25rem;
        }

        .option-description {
          font-size: 0.75rem;
          opacity: 0.8;
        }

        @media (max-width: 640px) {
          .font-size-options {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

