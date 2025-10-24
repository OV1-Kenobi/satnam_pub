/**
 * Theme Preview Component
 * Phase 4A: Theme Editor
 * 
 * Live preview of profile theme with sample content
 */

import React from 'react';
import type { ProfileTheme } from '../../../../types/profile';

interface ThemePreviewProps {
  theme: ProfileTheme;
}

/**
 * Theme Preview Component
 * Shows a live preview of how the theme will look on the profile
 */
export function ThemePreview({ theme }: ThemePreviewProps) {
  const { colorScheme, typography, layout } = theme;

  // Calculate font size in pixels
  const getFontSize = () => {
    switch (typography.fontSize) {
      case 'small':
        return '14px';
      case 'large':
        return '18px';
      default:
        return '16px';
    }
  };

  return (
    <div className="theme-preview">
      <h3 className="preview-title">Preview</h3>
      <p className="preview-description">
        See how your theme will look on your profile
      </p>

      <div
        className="preview-container"
        style={{
          backgroundColor: colorScheme.background,
          color: colorScheme.text,
          fontFamily: typography.fontFamily,
          fontSize: getFontSize(),
        }}
      >
        {/* Banner (if enabled) */}
        {layout.showBanner && (
          <div
            className="preview-banner"
            style={{
              background: `linear-gradient(135deg, ${colorScheme.primary}, ${colorScheme.secondary})`,
            }}
          >
            <div className="banner-overlay">Banner Image</div>
          </div>
        )}

        {/* Profile Content */}
        <div className="preview-content">
          {/* Profile Header */}
          <div className="preview-header">
            <div className="preview-avatar" style={{ borderColor: colorScheme.primary }}>
              <span style={{ color: colorScheme.primary }}>👤</span>
            </div>
            <h2 className="preview-name" style={{ color: colorScheme.text }}>
              Your Name
            </h2>
            <p className="preview-username" style={{ color: colorScheme.text, opacity: 0.7 }}>
              @username
            </p>
          </div>

          {/* Sample Bio */}
          <div className="preview-bio">
            <p style={{ color: colorScheme.text }}>
              This is a sample bio text. Your profile description will appear here.
            </p>
          </div>

          {/* Sample Button */}
          <button
            className="preview-button"
            style={{
              backgroundColor: colorScheme.primary,
              color: colorScheme.background,
            }}
          >
            Follow
          </button>

          {/* Social Links (if enabled) */}
          {layout.showSocialLinks && (
            <div className="preview-social-links">
              <div
                className="social-link"
                style={{
                  borderColor: colorScheme.accent,
                  color: colorScheme.accent,
                }}
              >
                🔗 Nostr
              </div>
              <div
                className="social-link"
                style={{
                  borderColor: colorScheme.accent,
                  color: colorScheme.accent,
                }}
              >
                ⚡ Lightning
              </div>
              <div
                className="social-link"
                style={{
                  borderColor: colorScheme.accent,
                  color: colorScheme.accent,
                }}
              >
                🌐 Website
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .theme-preview {
          padding: 1.5rem;
          background: #f9fafb;
          border-radius: 0.5rem;
        }

        .preview-title {
          font-size: 1.25rem;
          font-weight: 600;
          color: #1f2937;
          margin-bottom: 0.5rem;
        }

        .preview-description {
          font-size: 0.875rem;
          color: #6b7280;
          margin-bottom: 1.5rem;
        }

        .preview-container {
          border: 2px solid #d1d5db;
          border-radius: 0.5rem;
          overflow: hidden;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }

        .preview-banner {
          height: 120px;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .banner-overlay {
          color: white;
          font-size: 0.875rem;
          font-weight: 500;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }

        .preview-content {
          padding: 1.5rem;
        }

        .preview-header {
          text-align: center;
          margin-bottom: 1.5rem;
        }

        .preview-avatar {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          border: 3px solid;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: -40px auto 1rem;
          background: white;
          font-size: 2rem;
        }

        .preview-name {
          font-size: 1.5rem;
          font-weight: 700;
          margin: 0 0 0.25rem 0;
        }

        .preview-username {
          font-size: 0.875rem;
          margin: 0;
        }

        .preview-bio {
          margin-bottom: 1.5rem;
          text-align: center;
        }

        .preview-button {
          display: block;
          width: 100%;
          padding: 0.75rem;
          border: none;
          border-radius: 0.375rem;
          font-weight: 600;
          cursor: pointer;
          margin-bottom: 1.5rem;
          transition: opacity 0.2s;
        }

        .preview-button:hover {
          opacity: 0.9;
        }

        .preview-social-links {
          display: flex;
          gap: 0.75rem;
          justify-content: center;
          flex-wrap: wrap;
        }

        .social-link {
          padding: 0.5rem 1rem;
          border: 1px solid;
          border-radius: 0.375rem;
          font-size: 0.875rem;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}

