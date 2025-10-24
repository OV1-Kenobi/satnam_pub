/**
 * Social Links Editor Component
 * Phase 4C: Social Links Editor
 *
 * Main container for managing social links with add/remove/reorder functionality
 */

import React, { useState, useEffect } from "react";
import type { SocialLink } from "../../../../types/profile";
import { SocialLinkInput } from "./SocialLinkInput";
import { SocialLinksPreview } from "./SocialLinksPreview";
import {
  validateSocialLinks,
  sanitizeSocialLinks,
  MAX_SOCIAL_LINKS,
} from "../../../../lib/validation/social-links-validation";
import { clientConfig } from "../../../../config/env.client";

interface SocialLinksEditorProps {
  initialLinks?: SocialLink[];
  onSave: (links: SocialLink[]) => Promise<void>;
  onCancel?: () => void;
}

export const SocialLinksEditor: React.FC<SocialLinksEditorProps> = ({
  initialLinks = [],
  onSave,
  onCancel,
}) => {
  const [links, setLinks] = useState<SocialLink[]>(initialLinks);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Feature flag check
  const CUSTOMIZATION_ENABLED =
    clientConfig.flags.profileCustomizationEnabled;

  if (!CUSTOMIZATION_ENABLED) {
    return null;
  }

  const generateLinkId = () => {
    return `link-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  const handleAddLink = () => {
    if (links.length >= MAX_SOCIAL_LINKS) {
      setError(`Maximum ${MAX_SOCIAL_LINKS} social links allowed`);
      return;
    }

    const newLink: SocialLink = {
      id: generateLinkId(),
      platform: "website",
      url: "",
      order: links.length,
    };

    setLinks([...links, newLink]);
    setError(null);
  };

  const handleUpdateLink = (index: number, updatedLink: SocialLink) => {
    const newLinks = [...links];
    newLinks[index] = updatedLink;
    setLinks(newLinks);
    setError(null);
    setSuccessMessage(null);
  };

  const handleRemoveLink = (index: number) => {
    const newLinks = links.filter((_, i) => i !== index);
    // Reorder remaining links
    const reorderedLinks = newLinks.map((link, i) => ({
      ...link,
      order: i,
    }));
    setLinks(reorderedLinks);
    setError(null);
    setSuccessMessage(null);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;

    const newLinks = [...links];
    [newLinks[index - 1], newLinks[index]] = [
      newLinks[index],
      newLinks[index - 1],
    ];

    // Update order values
    const reorderedLinks = newLinks.map((link, i) => ({
      ...link,
      order: i,
    }));

    setLinks(reorderedLinks);
  };

  const handleMoveDown = (index: number) => {
    if (index === links.length - 1) return;

    const newLinks = [...links];
    [newLinks[index], newLinks[index + 1]] = [
      newLinks[index + 1],
      newLinks[index],
    ];

    // Update order values
    const reorderedLinks = newLinks.map((link, i) => ({
      ...link,
      order: i,
    }));

    setLinks(reorderedLinks);
  };

  const handleSave = async () => {
    setError(null);
    setSuccessMessage(null);

    // Filter out empty links
    const nonEmptyLinks = links.filter((link) => link.url.trim().length > 0);

    // Validate all links
    const validation = validateSocialLinks(nonEmptyLinks);
    if (!validation.valid) {
      setError(validation.error || "Validation failed");
      return;
    }

    // Sanitize links
    const sanitizedLinks = sanitizeSocialLinks(nonEmptyLinks);

    setIsSaving(true);
    try {
      await onSave(sanitizedLinks);
      setSuccessMessage("Social links saved successfully!");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save social links");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setLinks(initialLinks);
    setError(null);
    setSuccessMessage(null);
  };

  const hasChanges =
    JSON.stringify(links) !== JSON.stringify(initialLinks);

  return (
    <div className="social-links-editor">
      <div className="social-links-editor__header">
        <h2 className="social-links-editor__title">Social Links</h2>
        <p className="social-links-editor__description">
          Add links to your social profiles and websites (max {MAX_SOCIAL_LINKS})
        </p>
      </div>

      {error && (
        <div className="social-links-editor__error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {successMessage && (
        <div className="social-links-editor__success">{successMessage}</div>
      )}

      <div className="social-links-editor__content">
        <div className="social-links-editor__inputs">
          {links.length === 0 ? (
            <div className="social-links-editor__empty">
              <p>No social links added yet.</p>
              <button
                type="button"
                onClick={handleAddLink}
                className="social-links-editor__add-btn"
              >
                + Add Your First Link
              </button>
            </div>
          ) : (
            <>
              {links.map((link, index) => (
                <SocialLinkInput
                  key={link.id}
                  link={link}
                  onChange={(updatedLink) => handleUpdateLink(index, updatedLink)}
                  onRemove={() => handleRemoveLink(index)}
                  onMoveUp={() => handleMoveUp(index)}
                  onMoveDown={() => handleMoveDown(index)}
                  isFirst={index === 0}
                  isLast={index === links.length - 1}
                />
              ))}

              {links.length < MAX_SOCIAL_LINKS && (
                <button
                  type="button"
                  onClick={handleAddLink}
                  className="social-links-editor__add-btn"
                >
                  + Add Another Link
                </button>
              )}
            </>
          )}
        </div>

        <div className="social-links-editor__preview">
          <SocialLinksPreview links={links} />
        </div>
      </div>

      <div className="social-links-editor__actions">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
          className="social-links-editor__save-btn"
        >
          {isSaving ? "Saving..." : "Save Changes"}
        </button>

        <button
          type="button"
          onClick={handleReset}
          disabled={isSaving || !hasChanges}
          className="social-links-editor__reset-btn"
        >
          Reset
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="social-links-editor__cancel-btn"
          >
            Cancel
          </button>
        )}
      </div>

      <style>{`
        .social-links-editor {
          max-width: 1200px;
          margin: 0 auto;
          padding: 24px;
        }

        .social-links-editor__header {
          margin-bottom: 24px;
        }

        .social-links-editor__title {
          font-size: 24px;
          font-weight: 600;
          margin: 0 0 8px 0;
          color: #333;
        }

        .social-links-editor__description {
          font-size: 14px;
          color: #666;
          margin: 0;
        }

        .social-links-editor__error {
          padding: 12px 16px;
          background: #ffebee;
          border: 1px solid #ef5350;
          border-radius: 4px;
          color: #c62828;
          margin-bottom: 16px;
        }

        .social-links-editor__success {
          padding: 12px 16px;
          background: #e8f5e9;
          border: 1px solid #66bb6a;
          border-radius: 4px;
          color: #2e7d32;
          margin-bottom: 16px;
        }

        .social-links-editor__content {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          margin-bottom: 24px;
        }

        .social-links-editor__inputs {
          display: flex;
          flex-direction: column;
        }

        .social-links-editor__empty {
          text-align: center;
          padding: 48px 24px;
          background: #f9f9f9;
          border-radius: 8px;
          border: 2px dashed #ccc;
        }

        .social-links-editor__add-btn {
          padding: 12px 24px;
          background: #8b5cf6;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          margin-top: 12px;
        }

        .social-links-editor__add-btn:hover {
          background: #7c3aed;
        }

        .social-links-editor__actions {
          display: flex;
          gap: 12px;
          padding-top: 24px;
          border-top: 1px solid #e0e0e0;
        }

        .social-links-editor__save-btn,
        .social-links-editor__reset-btn,
        .social-links-editor__cancel-btn {
          padding: 12px 24px;
          border: none;
          border-radius: 4px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
        }

        .social-links-editor__save-btn {
          background: #8b5cf6;
          color: white;
        }

        .social-links-editor__save-btn:hover:not(:disabled) {
          background: #7c3aed;
        }

        .social-links-editor__save-btn:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        .social-links-editor__reset-btn {
          background: #f5f5f5;
          color: #333;
        }

        .social-links-editor__reset-btn:hover:not(:disabled) {
          background: #e0e0e0;
        }

        .social-links-editor__reset-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .social-links-editor__cancel-btn {
          background: white;
          color: #666;
          border: 1px solid #ccc;
        }

        .social-links-editor__cancel-btn:hover:not(:disabled) {
          background: #f5f5f5;
        }

        @media (max-width: 768px) {
          .social-links-editor {
            padding: 16px;
          }

          .social-links-editor__content {
            grid-template-columns: 1fr;
          }

          .social-links-editor__actions {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
};

