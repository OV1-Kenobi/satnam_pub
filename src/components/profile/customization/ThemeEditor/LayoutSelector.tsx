/**
 * Layout Selector Component
 * Phase 4A: Theme Editor
 * 
 * Allows users to customize layout style and visibility options
 */

import React from 'react';
import type { Layout } from '../../../../types/profile';

interface LayoutSelectorProps {
  layout: Layout;
  onChange: (layout: Layout) => void;
}

const LAYOUT_STYLES: Array<{
  value: Layout['style'];
  label: string;
  description: string;
}> = [
  {
    value: 'modern',
    label: 'Modern',
    description: 'Clean, contemporary design with bold elements',
  },
  {
    value: 'classic',
    label: 'Classic',
    description: 'Traditional layout with timeless styling',
  },
  {
    value: 'minimal',
    label: 'Minimal',
    description: 'Simple, distraction-free design',
  },
];

/**
 * Layout Selector Component
 */
export function LayoutSelector({ layout, onChange }: LayoutSelectorProps) {
  const handleStyleChange = (style: Layout['style']) => {
    onChange({
      ...layout,
      style,
    });
  };

  const handleToggle = (key: 'showBanner' | 'showSocialLinks') => {
    onChange({
      ...layout,
      [key]: !layout[key],
    });
  };

  return (
    <div className="layout-selector">
      <h3 className="section-title">Layout</h3>
      <p className="section-description">
        Choose your profile layout style and visibility options
      </p>

      <div className="layout-controls">
        {/* Layout Style Selector */}
        <div className="control-group">
          <label className="control-label">Layout Style</label>
          <div className="layout-style-options">
            {LAYOUT_STYLES.map((style) => (
              <button
                key={style.value}
                type="button"
                onClick={() => handleStyleChange(style.value)}
                className={`layout-style-option ${layout.style === style.value ? 'active' : ''}`}
              >
                <span className="option-label">{style.label}</span>
                <span className="option-description">{style.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Visibility Toggles */}
        <div className="control-group">
          <label className="control-label">Visibility Options</label>
          <div className="visibility-toggles">
            <label className="toggle-item">
              <input
                type="checkbox"
                checked={layout.showBanner}
                onChange={() => handleToggle('showBanner')}
                className="toggle-checkbox"
              />
              <span className="toggle-label">
                <span className="toggle-title">Show Banner</span>
                <span className="toggle-description">
                  Display banner image at the top of your profile
                </span>
              </span>
            </label>

            <label className="toggle-item">
              <input
                type="checkbox"
                checked={layout.showSocialLinks}
                onChange={() => handleToggle('showSocialLinks')}
                className="toggle-checkbox"
              />
              <span className="toggle-label">
                <span className="toggle-title">Show Social Links</span>
                <span className="toggle-description">
                  Display your social media links on your profile
                </span>
              </span>
            </label>
          </div>
        </div>
      </div>

      <style>{`
        .layout-selector {
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

        .layout-controls {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .control-group {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .control-label {
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
        }

        .layout-style-options {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.75rem;
        }

        .layout-style-option {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 1rem;
          border: 2px solid #d1d5db;
          border-radius: 0.375rem;
          background: white;
          cursor: pointer;
          transition: all 0.2s;
          text-align: center;
        }

        .layout-style-option:hover {
          border-color: #8b5cf6;
          background: #faf5ff;
        }

        .layout-style-option.active {
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

        .visibility-toggles {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .toggle-item {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 1rem;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 0.375rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .toggle-item:hover {
          border-color: #8b5cf6;
          background: #faf5ff;
        }

        .toggle-checkbox {
          width: 1.25rem;
          height: 1.25rem;
          margin-top: 0.125rem;
          cursor: pointer;
          accent-color: #8b5cf6;
        }

        .toggle-label {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          flex: 1;
        }

        .toggle-title {
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
        }

        .toggle-description {
          font-size: 0.75rem;
          color: #6b7280;
        }

        @media (max-width: 640px) {
          .layout-style-options {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

