/**
 * BannerPreview Component
 * Phase 4B: Banner Management
 *
 * Live preview of banner with profile overlay
 * Responsive preview (desktop/mobile)
 */

import React, { useState } from "react";

interface BannerPreviewProps {
  bannerUrl: string;
  profileName?: string;
  profileAvatar?: string;
}

export function BannerPreview({
  bannerUrl,
  profileName = "Your Name",
  profileAvatar,
}: BannerPreviewProps) {
  const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");

  return (
    <div className="banner-preview">
      <div className="preview-header">
        <h3>Preview</h3>
        <div className="view-mode-toggle">
          <button
            className={viewMode === "desktop" ? "active" : ""}
            onClick={() => setViewMode("desktop")}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            Desktop
          </button>
          <button
            className={viewMode === "mobile" ? "active" : ""}
            onClick={() => setViewMode("mobile")}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
              <line x1="12" y1="18" x2="12.01" y2="18" />
            </svg>
            Mobile
          </button>
        </div>
      </div>

      <div className={`preview-container ${viewMode}`}>
        <div className="profile-card">
          <div
            className="profile-banner"
            style={{ backgroundImage: `url(${bannerUrl})` }}
          />
          <div className="profile-content">
            <div className="profile-avatar">
              {profileAvatar ? (
                <img src={profileAvatar} alt={profileName} />
              ) : (
                <div className="avatar-placeholder">
                  {profileName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="profile-info">
              <h4 className="profile-name">{profileName}</h4>
              <p className="profile-username">@username</p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .banner-preview {
          width: 100%;
        }

        .preview-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .preview-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: #2d3748;
        }

        .view-mode-toggle {
          display: flex;
          gap: 8px;
          background-color: #e2e8f0;
          padding: 4px;
          border-radius: 6px;
        }

        .view-mode-toggle button {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border: none;
          background: transparent;
          color: #4a5568;
          font-size: 13px;
          font-weight: 500;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .view-mode-toggle button.active {
          background-color: white;
          color: #8b5cf6;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .preview-container {
          display: flex;
          justify-content: center;
          padding: 24px;
          background-color: #f7fafc;
          border-radius: 8px;
          transition: all 0.3s ease;
        }

        .preview-container.desktop {
          max-width: 100%;
        }

        .preview-container.mobile {
          max-width: 400px;
          margin: 0 auto;
        }

        .profile-card {
          width: 100%;
          background-color: white;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .profile-banner {
          width: 100%;
          height: 200px;
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          background-color: #e2e8f0;
        }

        .preview-container.mobile .profile-banner {
          height: 120px;
        }

        .profile-content {
          padding: 16px 24px 24px;
          position: relative;
        }

        .profile-avatar {
          width: 96px;
          height: 96px;
          border-radius: 50%;
          border: 4px solid white;
          margin-top: -48px;
          margin-bottom: 12px;
          overflow: hidden;
          background-color: #e2e8f0;
        }

        .preview-container.mobile .profile-avatar {
          width: 72px;
          height: 72px;
          margin-top: -36px;
        }

        .profile-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .avatar-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
          color: white;
          font-size: 36px;
          font-weight: 600;
        }

        .preview-container.mobile .avatar-placeholder {
          font-size: 28px;
        }

        .profile-info {
          margin-top: 8px;
        }

        .profile-name {
          margin: 0 0 4px 0;
          font-size: 20px;
          font-weight: 700;
          color: #1a202c;
        }

        .preview-container.mobile .profile-name {
          font-size: 18px;
        }

        .profile-username {
          margin: 0;
          font-size: 14px;
          color: #718096;
        }

        @media (max-width: 768px) {
          .preview-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }

          .view-mode-toggle {
            width: 100%;
          }

          .view-mode-toggle button {
            flex: 1;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}

