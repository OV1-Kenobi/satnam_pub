/**
 * BannerUploader Component
 * Phase 4B: Banner Management
 *
 * Drag-and-drop file upload with validation
 */

import React, { useCallback, useState } from "react";
import {
  validateBannerFile,
  formatFileSize,
} from "../../../../lib/validation/banner-validation";
import type { BannerValidationResult } from "../../../../types/profile";

interface BannerUploaderProps {
  onFileSelected: (file: File) => void;
  onValidationError: (error: string) => void;
}

export function BannerUploader({
  onFileSelected,
  onValidationError,
}: BannerUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);

  const handleFile = useCallback(
    async (file: File) => {
      setIsValidating(true);
      setValidationWarnings([]);

      try {
        const validation: BannerValidationResult = await validateBannerFile(
          file
        );

        if (!validation.valid) {
          onValidationError(validation.error || "Invalid file");
          setIsValidating(false);
          return;
        }

        // Show warnings if any
        if (validation.warnings && validation.warnings.length > 0) {
          setValidationWarnings(validation.warnings);
        }

        // File is valid, pass to parent
        onFileSelected(file);
      } catch (error) {
        onValidationError(
          error instanceof Error ? error.message : "Validation failed"
        );
      } finally {
        setIsValidating(false);
      }
    },
    [onFileSelected, onValidationError]
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        handleFile(files[0]);
      }
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
    },
    [handleFile]
  );

  return (
    <div className="banner-uploader">
      <div
        className={`upload-dropzone ${isDragging ? "dragging" : ""} ${isValidating ? "validating" : ""}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {isValidating ? (
          <div className="upload-status">
            <div className="spinner" />
            <p>Validating image...</p>
          </div>
        ) : (
          <>
            <div className="upload-icon">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p className="upload-text">
              <strong>Drag and drop</strong> your banner image here
            </p>
            <p className="upload-subtext">or</p>
            <label htmlFor="banner-file-input" className="upload-button">
              Choose File
            </label>
            <input
              id="banner-file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileInput}
              style={{ display: "none" }}
            />
            <p className="upload-requirements">
              JPEG, PNG, or WebP • Max 5MB • Min 1200x300px • Recommended 4:1
              aspect ratio
            </p>
          </>
        )}
      </div>

      {validationWarnings.length > 0 && (
        <div className="validation-warnings">
          {validationWarnings.map((warning, index) => (
            <div key={index} className="warning-item">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .banner-uploader {
          width: 100%;
        }

        .upload-dropzone {
          border: 2px dashed #cbd5e0;
          border-radius: 8px;
          padding: 48px 24px;
          text-align: center;
          background-color: #f7fafc;
          transition: all 0.2s ease;
          cursor: pointer;
        }

        .upload-dropzone.dragging {
          border-color: #8b5cf6;
          background-color: #f3e8ff;
        }

        .upload-dropzone.validating {
          cursor: wait;
          opacity: 0.7;
        }

        .upload-status {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }

        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid #e2e8f0;
          border-top-color: #8b5cf6;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .upload-icon {
          color: #8b5cf6;
          margin-bottom: 16px;
        }

        .upload-text {
          font-size: 16px;
          color: #2d3748;
          margin: 0 0 8px 0;
        }

        .upload-subtext {
          font-size: 14px;
          color: #718096;
          margin: 0 0 16px 0;
        }

        .upload-button {
          display: inline-block;
          padding: 10px 24px;
          background-color: #8b5cf6;
          color: white;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }

        .upload-button:hover {
          background-color: #7c3aed;
        }

        .upload-requirements {
          font-size: 12px;
          color: #a0aec0;
          margin: 16px 0 0 0;
        }

        .validation-warnings {
          margin-top: 16px;
          padding: 12px;
          background-color: #fffbeb;
          border: 1px solid #fbbf24;
          border-radius: 6px;
        }

        .warning-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          color: #92400e;
          font-size: 14px;
          margin-bottom: 8px;
        }

        .warning-item:last-child {
          margin-bottom: 0;
        }

        .warning-item svg {
          flex-shrink: 0;
          margin-top: 2px;
        }
      `}</style>
    </div>
  );
}

