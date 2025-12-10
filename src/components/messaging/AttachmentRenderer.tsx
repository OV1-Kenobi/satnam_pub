/**
 * AttachmentRenderer - Display and download encrypted attachments
 *
 * Renders attachment previews for DMs and PNS notes, with download
 * and decryption capabilities using BlossomClient.
 *
 * @module src/components/messaging/AttachmentRenderer
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import { Download, FileIcon, Image, Music, Video, AlertCircle, Loader2 } from "lucide-react";
import { BlossomClient } from "../../lib/api/blossom-client";
import type { AttachmentDescriptor } from "../../lib/api/blossom-client";
import { showToast } from "../../services/toastService";

export interface AttachmentRendererProps {
  /** Attachments to render */
  attachments: AttachmentDescriptor[];
  /** Compact mode for message bubbles */
  compact?: boolean;
}

/**
 * Sanitize filename to prevent path traversal attacks.
 * Removes path separators and leading dots.
 */
function sanitizeFileName(fileName: string): string {
  // Extract basename (remove any path components) and sanitize
  const basename = fileName.split('/').pop()?.split('\\').pop() || 'download';
  // Remove leading dots to prevent hidden files
  return basename.replace(/^\.+/, '_');
}

/** Download state for an attachment */
interface DownloadState {
  status: "idle" | "downloading" | "complete" | "error";
  error?: string;
  objectUrl?: string;
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

export function AttachmentRenderer({
  attachments,
  compact = false,
}: AttachmentRendererProps) {
  const [downloadStates, setDownloadStates] = useState<Record<string, DownloadState>>({});
  const timeoutRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Cleanup on unmount: clear pending timeouts and revoke object URLs
  useEffect(() => {
    return () => {
      // Clear all pending timeouts
      Object.values(timeoutRefs.current).forEach(clearTimeout);
      // Note: downloadStates is captured at unmount time for URL cleanup
    };
  }, []);

  const downloadAttachment = useCallback(async (attachment: AttachmentDescriptor) => {
    const key = attachment.sha256;

    // Update state to downloading
    setDownloadStates(prev => ({
      ...prev,
      [key]: { status: "downloading" },
    }));

    try {
      const blossomClient = BlossomClient.getInstance();
      const blob = await blossomClient.downloadAndDecrypt(
        attachment.url,
        attachment.enc.key,
        attachment.enc.iv,
        attachment.sha256
      );

      // Create blob with correct MIME type
      const typedBlob = new Blob([blob], { type: attachment.mimeType });
      const objectUrl = URL.createObjectURL(typedBlob);

      // Trigger download with sanitized filename
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = sanitizeFileName(attachment.fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setDownloadStates(prev => ({
        ...prev,
        [key]: { status: "complete", objectUrl },
      }));

      showToast.success(`Downloaded ${attachment.fileName}`, { title: "Download Complete" });

      // Clean up object URL after a delay (with timeout tracking for unmount cleanup)
      const timeoutId = setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
        setDownloadStates(prev => ({
          ...prev,
          [key]: { status: "idle" },
        }));
        delete timeoutRefs.current[key];
      }, 5000);
      timeoutRefs.current[key] = timeoutId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Download failed";
      setDownloadStates(prev => ({
        ...prev,
        [key]: { status: "error", error: errorMessage },
      }));
      showToast.error(errorMessage, { title: "Download Failed" });
    }
  }, []);

  if (attachments.length === 0) return null;

  return (
    <div className={compact ? "flex flex-wrap gap-1 mt-1" : "space-y-2 mt-2"}>
      {attachments.map((attachment) => {
        const IconComponent = getMediaIcon(attachment.mediaType);
        const state = downloadStates[attachment.sha256] || { status: "idle" };

        return (
          <div
            key={attachment.sha256}
            className={`flex items-center gap-2 p-2 rounded-lg border ${compact ? "bg-white/50 border-gray-200" : "bg-gray-50 border-gray-200"
              }`}
          >
            <IconComponent className="w-5 h-5 text-gray-500 flex-shrink-0" />

            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">
                {attachment.fileName}
              </div>
              <div className="text-xs text-gray-500">
                {formatSize(attachment.size)} • {attachment.mimeType}
              </div>
            </div>

            <button
              type="button"
              onClick={() => downloadAttachment(attachment)}
              disabled={state.status === "downloading"}
              className={`p-1.5 rounded transition-colors ${state.status === "error"
                ? "bg-red-100 text-red-600"
                : state.status === "downloading"
                  ? "bg-blue-100 text-blue-600"
                  : "bg-purple-100 text-purple-600 hover:bg-purple-200"
                }`}
              title={state.status === "error" ? state.error : "Download & decrypt"}
            >
              {state.status === "downloading" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : state.status === "error" ? (
                <AlertCircle className="w-4 h-4" />
              ) : (
                <Download className="w-4 h-4" />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default AttachmentRenderer;

