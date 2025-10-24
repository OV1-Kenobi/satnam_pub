/**
 * Social Link Input Component
 * Phase 4C: Social Links Editor
 *
 * Individual social link input with platform selector and validation
 */

import React, { useState, useEffect } from "react";
import type { SocialLink, SocialLinkPlatform } from "../../../../types/profile";
import { validatePlatformUrl } from "../../../../lib/validation/social-links-validation";

interface SocialLinkInputProps {
  link: SocialLink;
  onChange: (link: SocialLink) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst: boolean;
  isLast: boolean;
}

const PLATFORM_OPTIONS: Array<{
  value: SocialLinkPlatform;
  label: string;
  icon: string;
}> = [
  { value: "twitter", label: "Twitter / X", icon: "𝕏" },
  { value: "github", label: "GitHub", icon: "⚙" },
  { value: "telegram", label: "Telegram", icon: "✈" },
  { value: "nostr", label: "Nostr", icon: "⚡" },
  { value: "lightning", label: "Lightning", icon: "₿" },
  { value: "youtube", label: "YouTube", icon: "▶" },
  { value: "linkedin", label: "LinkedIn", icon: "in" },
  { value: "instagram", label: "Instagram", icon: "📷" },
  { value: "facebook", label: "Facebook", icon: "f" },
  { value: "website", label: "Website", icon: "🌐" },
];

export const SocialLinkInput: React.FC<SocialLinkInputProps> = ({
  link,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}) => {
  const [validationError, setValidationError] = useState<string | null>(null);

  // Validate URL when it changes
  useEffect(() => {
    if (link.url.trim().length > 0) {
      const validation = validatePlatformUrl(link.platform, link.url);
      setValidationError(validation.valid ? null : validation.error || null);
    } else {
      setValidationError(null);
    }
  }, [link.url, link.platform]);

  const handlePlatformChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...link,
      platform: e.target.value as SocialLinkPlatform,
    });
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...link,
      url: e.target.value,
    });
  };

  const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...link,
      label: e.target.value || undefined,
    });
  };

  const selectedPlatform = PLATFORM_OPTIONS.find(
    (p) => p.value === link.platform
  );

  return (
    <div className="social-link-input">
      <div className="social-link-input__header">
        <div className="social-link-input__platform-icon">
          {selectedPlatform?.icon || "🔗"}
        </div>
        <div className="social-link-input__controls">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            className="social-link-input__move-btn"
            title="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast}
            className="social-link-input__move-btn"
            title="Move down"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="social-link-input__remove-btn"
            title="Remove link"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="social-link-input__fields">
        <div className="social-link-input__field">
          <label htmlFor={`platform-${link.id}`}>Platform</label>
          <select
            id={`platform-${link.id}`}
            value={link.platform}
            onChange={handlePlatformChange}
            className="social-link-input__select"
          >
            {PLATFORM_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.icon} {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="social-link-input__field">
          <label htmlFor={`url-${link.id}`}>
            {link.platform === "nostr"
              ? "Nostr Public Key (npub)"
              : link.platform === "lightning"
              ? "Lightning Address"
              : "URL"}
          </label>
          <input
            id={`url-${link.id}`}
            type="text"
            value={link.url}
            onChange={handleUrlChange}
            placeholder={
              link.platform === "twitter"
                ? "https://twitter.com/username"
                : link.platform === "github"
                ? "https://github.com/username"
                : link.platform === "telegram"
                ? "https://t.me/username"
                : link.platform === "nostr"
                ? "npub1..."
                : link.platform === "lightning"
                ? "username@domain.com"
                : "https://example.com"
            }
            className={`social-link-input__input ${
              validationError ? "social-link-input__input--error" : ""
            }`}
          />
          {validationError && (
            <div className="social-link-input__error">{validationError}</div>
          )}
        </div>

        <div className="social-link-input__field">
          <label htmlFor={`label-${link.id}`}>
            Custom Label (optional)
          </label>
          <input
            id={`label-${link.id}`}
            type="text"
            value={link.label || ""}
            onChange={handleLabelChange}
            placeholder="e.g., My Blog, Work Profile"
            maxLength={50}
            className="social-link-input__input"
          />
        </div>
      </div>

      <style>{`
        .social-link-input {
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 12px;
          background: #fafafa;
        }

        .social-link-input__header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .social-link-input__platform-icon {
          font-size: 24px;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .social-link-input__controls {
          display: flex;
          gap: 8px;
        }

        .social-link-input__move-btn,
        .social-link-input__remove-btn {
          padding: 4px 8px;
          border: 1px solid #ccc;
          border-radius: 4px;
          background: white;
          cursor: pointer;
          font-size: 14px;
        }

        .social-link-input__move-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .social-link-input__move-btn:hover:not(:disabled),
        .social-link-input__remove-btn:hover {
          background: #f0f0f0;
        }

        .social-link-input__remove-btn {
          color: #d32f2f;
        }

        .social-link-input__fields {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .social-link-input__field {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .social-link-input__field label {
          font-size: 12px;
          font-weight: 500;
          color: #666;
        }

        .social-link-input__select,
        .social-link-input__input {
          padding: 8px 12px;
          border: 1px solid #ccc;
          border-radius: 4px;
          font-size: 14px;
          background: white;
        }

        .social-link-input__input--error {
          border-color: #d32f2f;
        }

        .social-link-input__error {
          font-size: 12px;
          color: #d32f2f;
          margin-top: 4px;
        }

        @media (max-width: 768px) {
          .social-link-input {
            padding: 12px;
          }
        }
      `}</style>
    </div>
  );
};

