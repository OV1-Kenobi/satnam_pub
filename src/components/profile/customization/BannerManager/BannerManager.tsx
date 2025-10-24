/**
 * BannerManager Component
 * Phase 4B: Banner Management
 *
 * Main container integrating all banner management sub-components
 * Upload → Crop → Preview → Save workflow
 */

import React, { useState, useCallback } from "react";
import type { Area } from "react-easy-crop";
import { BannerUploader } from "./BannerUploader";
import { BannerCropper, createCroppedImage } from "./BannerCropper";
import { BannerPreview } from "./BannerPreview";
import {
  uploadBannerToBlossom,
  convertToDataUrl,
  compressImage,
} from "../../../../lib/api/blossom-client";
import { canUseDataUrlFallback } from "../../../../lib/validation/banner-validation";
import { clientConfig } from "../../../../config/env.client";

interface BannerManagerProps {
  currentBannerUrl?: string;
  onSave: (bannerUrl: string) => Promise<void>;
  onRemove?: () => Promise<void>;
  onCancel: () => void;
}

type WorkflowStep = "upload" | "crop" | "preview" | "uploading";

export function BannerManager({
  currentBannerUrl,
  onSave,
  onRemove,
  onCancel,
}: BannerManagerProps) {
  // Feature flag check
  if (!clientConfig.flags.profileCustomizationEnabled) {
    return null;
  }

  const [step, setStep] = useState<WorkflowStep>("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>("");
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [finalBannerUrl, setFinalBannerUrl] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [isRemoving, setIsRemoving] = useState(false);

  const handleFileSelected = useCallback((file: File) => {
    setSelectedFile(file);
    setError("");

    // Create preview URL
    const previewUrl = URL.createObjectURL(file);
    setImagePreviewUrl(previewUrl);

    // Move to crop step
    setStep("crop");
  }, []);

  const handleValidationError = useCallback((error: string) => {
    setError(error);
  }, []);

  const handleCropComplete = useCallback(
    async (cropArea: Area) => {
      if (!selectedFile || !imagePreviewUrl) return;

      try {
        setStep("uploading");
        setUploadProgress("Cropping image...");

        // Create cropped image blob
        const croppedBlob = await createCroppedImage(imagePreviewUrl, cropArea);

        // Convert blob to File
        const croppedFile = new File([croppedBlob], selectedFile.name, {
          type: "image/webp",
          lastModified: Date.now(),
        });

        setUploadProgress("Compressing image...");

        // Compress image
        const compressedFile = await compressImage(croppedFile, 2000, 0.85);

        setUploadProgress("Uploading to Blossom...");

        // Try to upload to Blossom
        const uploadResult = await uploadBannerToBlossom(compressedFile);

        if (uploadResult.success && uploadResult.url) {
          // Success! Use Blossom URL
          setFinalBannerUrl(uploadResult.url);
          setStep("preview");
          setUploadProgress("");
        } else {
          // Blossom upload failed, try data URL fallback
          if (canUseDataUrlFallback(compressedFile)) {
            setUploadProgress("Using fallback storage...");
            const dataUrl = await convertToDataUrl(compressedFile);
            setFinalBannerUrl(dataUrl);
            setStep("preview");
            setUploadProgress("");
            setError(
              "⚠️ Using local storage (data URL). For better performance, enable Blossom upload."
            );
          } else {
            throw new Error(
              "File too large for fallback storage. Please enable Blossom upload or use a smaller image."
            );
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to process image");
        setStep("crop");
        setUploadProgress("");
      }
    },
    [selectedFile, imagePreviewUrl]
  );

  const handleCropCancel = useCallback(() => {
    setStep("upload");
    setSelectedFile(null);
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setImagePreviewUrl("");
  }, [imagePreviewUrl]);

  const handleSave = useCallback(async () => {
    if (!finalBannerUrl) return;

    try {
      await onSave(finalBannerUrl);
      // Success handled by parent
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save banner");
    }
  }, [finalBannerUrl, onSave]);

  const handleRemove = useCallback(async () => {
    if (!onRemove) return;

    setIsRemoving(true);
    try {
      await onRemove();
      // Success handled by parent
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove banner");
    } finally {
      setIsRemoving(false);
    }
  }, [onRemove]);

  return (
    <div className="banner-manager">
      <div className="manager-header">
        <h2>Banner Image</h2>
        <p className="manager-description">
          Upload a banner image for your profile. Recommended size: 1200x300px (4:1
          aspect ratio)
        </p>
      </div>

      {error && (
        <div className={`error-message ${error.startsWith("⚠️") ? "warning" : ""}`}>
          {error}
        </div>
      )}

      {step === "upload" && (
        <BannerUploader
          onFileSelected={handleFileSelected}
          onValidationError={handleValidationError}
        />
      )}

      {step === "crop" && imagePreviewUrl && (
        <BannerCropper
          imageUrl={imagePreviewUrl}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
        />
      )}

      {step === "uploading" && (
        <div className="upload-progress">
          <div className="spinner" />
          <p>{uploadProgress}</p>
        </div>
      )}

      {step === "preview" && finalBannerUrl && (
        <>
          <BannerPreview bannerUrl={finalBannerUrl} />
          <div className="preview-actions">
            <button onClick={() => setStep("upload")} className="btn-secondary">
              Choose Different Image
            </button>
            <button onClick={handleSave} className="btn-primary">
              Save Banner
            </button>
          </div>
        </>
      )}

      {currentBannerUrl && onRemove && step === "upload" && (
        <div className="current-banner-section">
          <h3>Current Banner</h3>
          <BannerPreview bannerUrl={currentBannerUrl} />
          <button
            onClick={handleRemove}
            className="btn-remove"
            disabled={isRemoving}
          >
            {isRemoving ? "Removing..." : "Remove Banner"}
          </button>
        </div>
      )}

      <div className="manager-actions">
        <button onClick={onCancel} className="btn-cancel">
          Cancel
        </button>
      </div>

      <style>{`
        .banner-manager {
          width: 100%;
          max-width: 900px;
          margin: 0 auto;
        }

        .manager-header {
          margin-bottom: 24px;
        }

        .manager-header h2 {
          margin: 0 0 8px 0;
          font-size: 24px;
          font-weight: 700;
          color: #1a202c;
        }

        .manager-description {
          margin: 0;
          font-size: 14px;
          color: #718096;
        }

        .error-message {
          padding: 12px 16px;
          margin-bottom: 16px;
          background-color: #fee;
          border: 1px solid #fcc;
          border-radius: 6px;
          color: #c00;
          font-size: 14px;
        }

        .error-message.warning {
          background-color: #fffbeb;
          border-color: #fbbf24;
          color: #92400e;
        }

        .upload-progress {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          padding: 48px 24px;
          background-color: #f7fafc;
          border-radius: 8px;
        }

        .spinner {
          width: 48px;
          height: 48px;
          border: 4px solid #e2e8f0;
          border-top-color: #8b5cf6;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .preview-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 16px;
        }

        .current-banner-section {
          margin-top: 32px;
          padding-top: 32px;
          border-top: 1px solid #e2e8f0;
        }

        .current-banner-section h3 {
          margin: 0 0 16px 0;
          font-size: 18px;
          font-weight: 600;
          color: #2d3748;
        }

        .manager-actions {
          margin-top: 24px;
          padding-top: 24px;
          border-top: 1px solid #e2e8f0;
          display: flex;
          justify-content: flex-end;
        }

        .btn-primary,
        .btn-secondary,
        .btn-cancel,
        .btn-remove {
          padding: 10px 24px;
          border-radius: 6px;
          font-weight: 500;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
          border: none;
        }

        .btn-primary {
          background-color: #8b5cf6;
          color: white;
        }

        .btn-primary:hover {
          background-color: #7c3aed;
        }

        .btn-secondary {
          background-color: #e2e8f0;
          color: #2d3748;
        }

        .btn-secondary:hover {
          background-color: #cbd5e0;
        }

        .btn-cancel {
          background-color: transparent;
          color: #718096;
        }

        .btn-cancel:hover {
          background-color: #f7fafc;
        }

        .btn-remove {
          background-color: #fee;
          color: #c00;
          margin-top: 16px;
        }

        .btn-remove:hover:not(:disabled) {
          background-color: #fcc;
        }

        .btn-remove:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

