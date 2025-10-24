/**
 * Social Links Preview Component
 * Phase 4C: Social Links Editor
 *
 * Live preview of social links with icons
 */

import React from "react";
import type { SocialLink } from "../../../../types/profile";

interface SocialLinksPreviewProps {
  links: SocialLink[];
}

const PLATFORM_ICONS: Record<string, string> = {
  twitter: "𝕏",
  github: "⚙",
  telegram: "✈",
  nostr: "⚡",
  lightning: "₿",
  youtube: "▶",
  linkedin: "in",
  instagram: "📷",
  facebook: "f",
  website: "🌐",
};

const PLATFORM_COLORS: Record<string, string> = {
  twitter: "#1DA1F2",
  github: "#333",
  telegram: "#0088cc",
  nostr: "#8b5cf6",
  lightning: "#f7931a",
  youtube: "#FF0000",
  linkedin: "#0077b5",
  instagram: "#E4405F",
  facebook: "#1877F2",
  website: "#666",
};

export const SocialLinksPreview: React.FC<SocialLinksPreviewProps> = ({
  links,
}) => {
  if (links.length === 0) {
    return (
      <div className="social-links-preview">
        <div className="social-links-preview__empty">
          <p>No social links added yet.</p>
          <p className="social-links-preview__empty-hint">
            Add links to see how they'll appear on your profile.
          </p>
        </div>

        <style>{`
          .social-links-preview {
            padding: 24px;
            background: #f9f9f9;
            border-radius: 8px;
            border: 1px solid #e0e0e0;
          }

          .social-links-preview__empty {
            text-align: center;
            color: #999;
          }

          .social-links-preview__empty-hint {
            font-size: 14px;
            margin-top: 8px;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="social-links-preview">
      <h3 className="social-links-preview__title">Preview</h3>
      <p className="social-links-preview__subtitle">
        How your social links will appear on your profile
      </p>

      <div className="social-links-preview__links">
        {links
          .sort((a, b) => a.order - b.order)
          .map((link) => {
            const icon = PLATFORM_ICONS[link.platform] || "🔗";
            const color = PLATFORM_COLORS[link.platform] || "#666";
            const displayLabel =
              link.label ||
              link.platform.charAt(0).toUpperCase() + link.platform.slice(1);

            return (
              <a
                key={link.id}
                href={
                  link.platform === "nostr"
                    ? `nostr:${link.url}`
                    : link.platform === "lightning"
                    ? `lightning:${link.url}`
                    : link.url
                }
                target="_blank"
                rel="noopener noreferrer"
                className="social-links-preview__link"
                style={{ borderColor: color }}
              >
                <span
                  className="social-links-preview__icon"
                  style={{ color }}
                >
                  {icon}
                </span>
                <span className="social-links-preview__label">
                  {displayLabel}
                </span>
              </a>
            );
          })}
      </div>

      <style>{`
        .social-links-preview {
          padding: 24px;
          background: #f9f9f9;
          border-radius: 8px;
          border: 1px solid #e0e0e0;
        }

        .social-links-preview__title {
          font-size: 18px;
          font-weight: 600;
          margin: 0 0 8px 0;
          color: #333;
        }

        .social-links-preview__subtitle {
          font-size: 14px;
          color: #666;
          margin: 0 0 20px 0;
        }

        .social-links-preview__links {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        .social-links-preview__link {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          border: 2px solid;
          border-radius: 24px;
          background: white;
          text-decoration: none;
          color: #333;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s ease;
        }

        .social-links-preview__link:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        }

        .social-links-preview__icon {
          font-size: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .social-links-preview__label {
          white-space: nowrap;
        }

        @media (max-width: 768px) {
          .social-links-preview {
            padding: 16px;
          }

          .social-links-preview__links {
            gap: 8px;
          }

          .social-links-preview__link {
            padding: 6px 12px;
            font-size: 13px;
          }
        }
      `}</style>
    </div>
  );
};

