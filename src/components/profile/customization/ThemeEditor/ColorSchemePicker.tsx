/**
 * Color Scheme Picker Component
 * Phase 4A: Theme Editor
 * 
 * Allows users to customize the 5 colors in their profile theme
 */

import React from 'react';
import type { ColorScheme } from '../../../../types/profile';
import { isValidHexColor } from '../../../../lib/validation/profile-customization';

interface ColorSchemePickerProps {
  colorScheme: ColorScheme;
  onChange: (colorScheme: ColorScheme) => void;
}

interface ColorInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  description: string;
}

/**
 * Single color input with validation
 */
function ColorInput({ label, value, onChange, description }: ColorInputProps) {
  const [localValue, setLocalValue] = React.useState(value);
  const [isValid, setIsValid] = React.useState(true);

  // Update local value when prop changes
  React.useEffect(() => {
    setLocalValue(value);
    setIsValid(isValidHexColor(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);

    // Validate and update parent
    if (isValidHexColor(newValue)) {
      setIsValid(true);
      onChange(newValue);
    } else {
      setIsValid(false);
    }
  };

  return (
    <div className="color-input-group">
      <label htmlFor={`color-${label}`} className="color-label">
        {label}
      </label>
      <div className="color-input-wrapper">
        <input
          type="color"
          id={`color-${label}`}
          value={localValue}
          onChange={handleChange}
          className="color-picker"
        />
        <input
          type="text"
          value={localValue}
          onChange={handleChange}
          placeholder="#000000"
          maxLength={7}
          className={`color-text-input ${!isValid ? 'invalid' : ''}`}
        />
      </div>
      <p className="color-description">{description}</p>
      {!isValid && (
        <p className="color-error">Invalid hex color. Use format: #RRGGBB</p>
      )}
    </div>
  );
}

/**
 * Color Scheme Picker Component
 */
export function ColorSchemePicker({ colorScheme, onChange }: ColorSchemePickerProps) {
  const handleColorChange = (key: keyof ColorScheme, value: string) => {
    onChange({
      ...colorScheme,
      [key]: value,
    });
  };

  return (
    <div className="color-scheme-picker">
      <h3 className="section-title">Color Scheme</h3>
      <p className="section-description">
        Customize the colors used throughout your profile
      </p>

      <div className="color-inputs">
        <ColorInput
          label="Primary"
          value={colorScheme.primary}
          onChange={(value) => handleColorChange('primary', value)}
          description="Main brand color for buttons and links"
        />

        <ColorInput
          label="Secondary"
          value={colorScheme.secondary}
          onChange={(value) => handleColorChange('secondary', value)}
          description="Secondary accent color"
        />

        <ColorInput
          label="Background"
          value={colorScheme.background}
          onChange={(value) => handleColorChange('background', value)}
          description="Background color for your profile"
        />

        <ColorInput
          label="Text"
          value={colorScheme.text}
          onChange={(value) => handleColorChange('text', value)}
          description="Main text color"
        />

        <ColorInput
          label="Accent"
          value={colorScheme.accent}
          onChange={(value) => handleColorChange('accent', value)}
          description="Highlight and accent color"
        />
      </div>

      <style>{`
        .color-scheme-picker {
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

        .color-inputs {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .color-input-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .color-label {
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
        }

        .color-input-wrapper {
          display: flex;
          gap: 0.75rem;
          align-items: center;
        }

        .color-picker {
          width: 3rem;
          height: 3rem;
          border: 2px solid #d1d5db;
          border-radius: 0.375rem;
          cursor: pointer;
        }

        .color-text-input {
          flex: 1;
          padding: 0.5rem 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 0.375rem;
          font-family: monospace;
          font-size: 0.875rem;
        }

        .color-text-input.invalid {
          border-color: #ef4444;
        }

        .color-description {
          font-size: 0.75rem;
          color: #9ca3af;
          margin: 0;
        }

        .color-error {
          font-size: 0.75rem;
          color: #ef4444;
          margin: 0;
        }
      `}</style>
    </div>
  );
}

