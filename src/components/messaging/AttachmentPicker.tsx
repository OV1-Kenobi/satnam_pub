/**
 * AttachmentPicker - Blossom-integrated file attachment component
 *
 * Provides UI for selecting, uploading, and displaying file attachments
 * for DMs and PNS notes. Files are encrypted with AES-256-GCM before
 * upload to Blossom servers.
 *
 * @module src/components/messaging/AttachmentPicker
 */

import React, { useRef, useState, useCallback, useEffect } from "react";
import { Paperclip, X, Upload, AlertCircle, FileIcon, Image, Music, Video } from "lucide-react";
import { BlossomClient, createAttachmentDescriptor, getMediaTypeFromMime } from "../../lib/api/blossom-client";
import type { AttachmentDescriptor } from "../../lib/api/blossom-client";
import { clientConfig } from "../../config/env.client";
import { showToast } from "../../services/toastService";

export interface AttachmentPickerProps {
  /** Callback when attachments change */
  onAttachmentsChange: (attachments: AttachmentDescriptor[]) => void;
  /** Current attachments */
  attachments: AttachmentDescriptor[];
  /** Maximum number of attachments allowed */
  maxAttachments?: number;
  /** Maximum file size in bytes (default: 20GB) */
  maxFileSize?: number;
  /** Accepted file types (default: all) */
  accept?: string;
  /** Whether the picker is disabled */
  disabled?: boolean;
  /** Compact mode for inline display */
  compact?: boolean;
}

/** Upload state for a single file */
interface UploadState {
  file: File;
  progress: number;
  status: "pending" | "uploading" | "complete" | "error";
  error?: string;
  attachment?: AttachmentDescriptor;
}

/**
 * Get icon component for media type
 */
function getMediaIcon(mediaType: "file" | "image" | "audio" | "video") {
  switch (mediaType) {
    case "image": return Image;
    case "audio": return Music;
    case "video": return Video;
    default: return FileIcon;
  }
}

/**
 * Format file size for display
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function AttachmentPicker({
  onAttachmentsChange,
  attachments,
  maxAttachments = 10,
  maxFileSize = 20 * 1024 * 1024 * 1024, // 20GB default
  accept,
  disabled = false,
  compact = false,
}: AttachmentPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const isMountedRef = useRef(true);

  // Track mount status to prevent state updates on unmounted component
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Check if Blossom is enabled
    if (!clientConfig.flags.blossomUploadEnabled) {
      showToast.error("File attachments are not enabled. Contact administrator.", { title: "Attachments Disabled" });
      return;
    }

    // Check attachment limit
    const remainingSlots = maxAttachments - attachments.length;
    if (remainingSlots <= 0) {
      showToast.warning(`Maximum ${maxAttachments} attachments allowed`, { title: "Limit Reached" });
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remainingSlots);
    const blossomClient = BlossomClient.getInstance();

    // Initialize upload states
    const newUploads: UploadState[] = filesToUpload.map(file => ({
      file,
      progress: 0,
      status: "pending" as const,
    }));
    setUploads(prev => [...prev, ...newUploads]);
    setIsUploading(true);

    const newAttachments: AttachmentDescriptor[] = [];

    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i];

      // Validate file size
      if (file.size > maxFileSize) {
        setUploads(prev => prev.map((u, idx) =>
          idx === prev.length - filesToUpload.length + i
            ? { ...u, status: "error", error: `File too large (max ${formatSize(maxFileSize)})` }
            : u
        ));
        continue;
      }

      // Update status to uploading
      setUploads(prev => prev.map((u, idx) =>
        idx === prev.length - filesToUpload.length + i
          ? { ...u, status: "uploading", progress: 10 }
          : u
      ));

      try {
        const result = await blossomClient.uploadEncryptedMedia(file);

        if (result.success) {
          const descriptor = createAttachmentDescriptor(result, file);
          if (descriptor) {
            newAttachments.push(descriptor);
            setUploads(prev => prev.map((u, idx) =>
              idx === prev.length - filesToUpload.length + i
                ? { ...u, status: "complete", progress: 100, attachment: descriptor }
                : u
            ));
          } else {
            // Handle case where descriptor creation failed despite successful upload
            setUploads(prev => prev.map((u, idx) =>
              idx === prev.length - filesToUpload.length + i
                ? { ...u, status: "error", error: "Failed to create attachment descriptor" }
                : u
            ));
          }
        } else {
          setUploads(prev => prev.map((u, idx) =>
            idx === prev.length - filesToUpload.length + i
              ? { ...u, status: "error", error: result.error || "Upload failed" }
              : u
          ));
        }
      } catch (error) {
        setUploads(prev => prev.map((u, idx) =>
          idx === prev.length - filesToUpload.length + i
            ? { ...u, status: "error", error: error instanceof Error ? error.message : "Upload failed" }
            : u
        ));
      }
    }

    if (newAttachments.length > 0) {
      onAttachmentsChange([...attachments, ...newAttachments]);
      showToast.success(`${newAttachments.length} file(s) uploaded`, { title: "Upload Complete" });
    }

    setIsUploading(false);
    // Clear completed uploads after a delay (check mount status to prevent memory leak)
    setTimeout(() => {
      if (isMountedRef.current) {
        setUploads(prev => prev.filter(u => u.status !== "complete"));
      }
    }, 2000);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [attachments, maxAttachments, maxFileSize, onAttachmentsChange]);

  const removeAttachment = useCallback((index: number) => {
    const newAttachments = attachments.filter((_, i) => i !== index);
    onAttachmentsChange(newAttachments);
  }, [attachments, onAttachmentsChange]);

  return (
    <div className={compact ? "inline-flex items-center gap-2" : "space-y-2"}>
      {/* File input (hidden) */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={accept}
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || isUploading}
      />

      {/* Attachment button */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled || isUploading || attachments.length >= maxAttachments}
        className={`p-2 rounded-lg transition-colors ${disabled || attachments.length >= maxAttachments
          ? "bg-gray-200 text-gray-400 cursor-not-allowed"
          : "bg-purple-200/60 text-purple-900 hover:bg-purple-300/60"
          }`}
        title={
          attachments.length >= maxAttachments
            ? `Maximum ${maxAttachments} attachments`
            : "Attach file (encrypted)"
        }
      >
        {isUploading ? (
          <Upload className="w-4 h-4 animate-pulse" />
        ) : (
          <Paperclip className="w-4 h-4" />
        )}
      </button>

      {/* Attachment previews */}
      {attachments.length > 0 && !compact && (
        <div className="flex flex-wrap gap-2 mt-2">
          {attachments.map((attachment, index) => {
            const IconComponent = getMediaIcon(attachment.mediaType);
            return (
              <div
                key={`${attachment.sha256}-${index}`}
                className="flex items-center gap-2 px-2 py-1 bg-purple-100 rounded-lg text-sm"
              >
                <IconComponent className="w-4 h-4 text-purple-600" />
                <span className="max-w-[120px] truncate text-purple-900">
                  {attachment.fileName}
                </span>
                <span className="text-xs text-purple-600">
                  {formatSize(attachment.size)}
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(index)}
                  className="p-0.5 hover:bg-purple-200 rounded"
                  title="Remove attachment"
                >
                  <X className="w-3 h-3 text-purple-700" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload progress indicators */}
      {uploads.filter(u => u.status === "uploading" || u.status === "error").length > 0 && (
        <div className="flex flex-col gap-1 mt-2">
          {uploads
            .filter(u => u.status === "uploading" || u.status === "error")
            .map((upload) => (
              <div
                key={`upload-${upload.file.name}-${upload.file.lastModified}`}
                className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${upload.status === "error" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                  }`}
              >
                {upload.status === "error" ? (
                  <AlertCircle className="w-3 h-3" />
                ) : (
                  <Upload className="w-3 h-3 animate-pulse" />
                )}
                <span className="truncate max-w-[150px]">{upload.file.name}</span>
                {upload.status === "error" && (
                  <span className="text-red-600">{upload.error}</span>
                )}
              </div>
            ))}
        </div>
      )}

      {/* Compact mode: show attachment count badge */}
      {compact && attachments.length > 0 && (
        <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-medium bg-purple-600 text-white rounded-full">
          {attachments.length}
        </span>
      )}
    </div>
  );
}

export default AttachmentPicker;

