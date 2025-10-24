/**
 * BannerCropper Component
 * Phase 4B: Banner Management
 *
 * Image cropping interface with 4:1 aspect ratio enforcement
 */

import React, { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import type { Area, Point } from "react-easy-crop";
import type { BannerCropOptions } from "../../../../types/profile";

interface BannerCropperProps {
  imageUrl: string;
  onCropComplete: (croppedAreaPixels: Area) => void;
  onCancel: () => void;
}

export function BannerCropper({
  imageUrl,
  onCropComplete,
  onCancel,
}: BannerCropperProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const handleCropChange = useCallback((location: Point) => {
    setCrop(location);
  }, []);

  const handleZoomChange = useCallback((zoom: number) => {
    setZoom(zoom);
  }, []);

  const handleCropCompleteInternal = useCallback(
    (croppedArea: Area, croppedAreaPixels: Area) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    []
  );

  const handleApplyCrop = useCallback(() => {
    if (croppedAreaPixels) {
      onCropComplete(croppedAreaPixels);
    }
  }, [croppedAreaPixels, onCropComplete]);

  return (
    <div className="banner-cropper">
      <div className="cropper-container">
        <Cropper
          image={imageUrl}
          crop={crop}
          zoom={zoom}
          aspect={4 / 1} // 4:1 aspect ratio
          onCropChange={handleCropChange}
          onZoomChange={handleZoomChange}
          onCropComplete={handleCropCompleteInternal}
          objectFit="horizontal-cover"
        />
      </div>

      <div className="cropper-controls">
        <div className="zoom-control">
          <label htmlFor="zoom-slider">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
            Zoom
          </label>
          <input
            id="zoom-slider"
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="zoom-slider"
          />
          <span className="zoom-value">{Math.round(zoom * 100)}%</span>
        </div>

        <div className="crop-info">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>Drag to reposition • Scroll to zoom • 4:1 aspect ratio enforced</span>
        </div>
      </div>

      <div className="cropper-actions">
        <button onClick={onCancel} className="btn-cancel">
          Cancel
        </button>
        <button
          onClick={handleApplyCrop}
          className="btn-apply"
          disabled={!croppedAreaPixels}
        >
          Apply Crop
        </button>
      </div>

      <style>{`
        .banner-cropper {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .cropper-container {
          position: relative;
          width: 100%;
          height: 400px;
          background-color: #000;
          border-radius: 8px;
          overflow: hidden;
        }

        .cropper-controls {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 16px;
          background-color: #f7fafc;
          border-radius: 8px;
        }

        .zoom-control {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .zoom-control label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 500;
          color: #2d3748;
          min-width: 80px;
        }

        .zoom-slider {
          flex: 1;
          height: 6px;
          border-radius: 3px;
          background: #e2e8f0;
          outline: none;
          -webkit-appearance: none;
        }

        .zoom-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #8b5cf6;
          cursor: pointer;
        }

        .zoom-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #8b5cf6;
          cursor: pointer;
          border: none;
        }

        .zoom-value {
          min-width: 50px;
          text-align: right;
          font-size: 14px;
          font-weight: 500;
          color: #4a5568;
        }

        .crop-info {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: #718096;
        }

        .crop-info svg {
          flex-shrink: 0;
        }

        .cropper-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
        }

        .btn-cancel,
        .btn-apply {
          padding: 10px 24px;
          border-radius: 6px;
          font-weight: 500;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
          border: none;
        }

        .btn-cancel {
          background-color: #e2e8f0;
          color: #2d3748;
        }

        .btn-cancel:hover {
          background-color: #cbd5e0;
        }

        .btn-apply {
          background-color: #8b5cf6;
          color: white;
        }

        .btn-apply:hover:not(:disabled) {
          background-color: #7c3aed;
        }

        .btn-apply:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        @media (max-width: 768px) {
          .cropper-container {
            height: 300px;
          }

          .zoom-control {
            flex-direction: column;
            align-items: stretch;
          }

          .zoom-control label {
            min-width: auto;
          }

          .zoom-value {
            text-align: left;
          }
        }
      `}</style>
    </div>
  );
}

/**
 * Create cropped image from crop area
 * Uses Canvas API to extract cropped region
 */
export async function createCroppedImage(
  imageSrc: string,
  cropArea: Area
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.src = imageSrc;

    image.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      // Set canvas size to crop area
      canvas.width = cropArea.width;
      canvas.height = cropArea.height;

      // Draw cropped image
      ctx.drawImage(
        image,
        cropArea.x,
        cropArea.y,
        cropArea.width,
        cropArea.height,
        0,
        0,
        cropArea.width,
        cropArea.height
      );

      // Convert to blob (WebP for better compression)
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to create cropped image"));
            return;
          }
          resolve(blob);
        },
        "image/webp",
        0.9
      );
    };

    image.onerror = () => {
      reject(new Error("Failed to load image"));
    };
  });
}

