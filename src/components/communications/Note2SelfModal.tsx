/**
 * Note2Self Modal - Private Notes Storage UI
 *
 * Provides UI for composing, viewing, and managing private notes using PnsService.
 * Features:
 * - Compose view with security mode selection
 * - Notes list with search/filter
 * - Delete confirmation
 * - Security tier controls (ephemeral vs everlasting)
 *
 * @module src/components/communications/Note2SelfModal
 */

import { useCallback, useEffect, useState } from 'react';
import { clientConfig, isPnsNoiseFsAvailable } from '../../config/env.client';
import type { PnsSecurityMode, NoiseSecurityTier, PnsNoteMetadata } from '../../lib/noise/types';
import { showToast } from '../../services/toastService';

// Types
interface Note2SelfModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: 'compose' | 'list';
  editNoteId?: string;
}

interface NoteListItem {
  noteId: string;
  content: string;
  title?: string;
  securityMode: PnsSecurityMode;
  securityTier?: NoiseSecurityTier;
  createdAt: number;
  tags?: string[];
}

type ModalView = 'compose' | 'list';

// Security mode labels
const SECURITY_MODE_LABELS: Record<PnsSecurityMode, { label: string; description: string }> = {
  'none': {
    label: 'Standard (NIP-44)',
    description: 'Encrypted with your PNS key. Recoverable with nsec.'
  },
  'noise-fs': {
    label: 'Forward Secure (Noise-FS)',
    description: 'Double encryption with forward secrecy. Requires device key for recovery.'
  }
};

const SECURITY_TIER_LABELS: Record<NoiseSecurityTier, { label: string; description: string }> = {
  'ephemeral-minimum': {
    label: 'Ephemeral (Minimum)',
    description: 'Short-term storage with minimal key derivation.'
  },
  'ephemeral-standard': {
    label: 'Ephemeral',
    description: 'Temporary storage with TTL. Auto-deletes after expiration.'
  },
  'everlasting-standard': {
    label: 'Everlasting',
    description: 'Permanent storage. Persists until manually deleted.'
  },
  'everlasting-maximum': {
    label: 'Everlasting (Maximum)',
    description: 'Maximum security with extended key derivation.'
  },
  'hardened': {
    label: 'Hardened (NFC MFA)',
    description: 'Requires NFC hardware token for access.'
  }
};

export function Note2SelfModal({
  isOpen,
  onClose,
  initialView = 'compose',
  editNoteId
}: Note2SelfModalProps) {
  // State
  const [view, setView] = useState<ModalView>(initialView);
  const [isLoading, setIsLoading] = useState(false);
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [pnsInitialized, setPnsInitialized] = useState(false);

  // Compose form state
  const [noteContent, setNoteContent] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteTags, setNoteTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [securityMode, setSecurityMode] = useState<PnsSecurityMode>(
    clientConfig.flags.pnsDefaultSecurityMode
  );
  const [securityTier, setSecurityTier] = useState<NoiseSecurityTier>(
    clientConfig.flags.pnsDefaultSecurityTier
  );
  const [ephemeralTtl, setEphemeralTtl] = useState<number>(
    clientConfig.flags.pnsEphemeralDefaultTtl
  );

  // Check if Noise-FS is available
  const noiseFsAvailable = isPnsNoiseFsAvailable();

  // Initialize PNS service
  const initializePns = useCallback(async () => {
    if (pnsInitialized) return true;

    try {
      // Lazy import PnsService to avoid circular dependencies
      const { PnsService } = await import('../../lib/nostr/pns/pns-service');
      const pns = PnsService.getInstance();

      if (pns.isInitialized()) {
        setPnsInitialized(true);
        return true;
      }

      // PnsService requires vault accessor and nsec - will be initialized
      // when user has active session with vault access
      showToast.warning('Please ensure you are signed in to use private notes', {
        title: 'Authentication Required'
      });
      return false;
    } catch (error) {
      console.error('[Note2Self] Failed to initialize PNS:', error);
      showToast.error('Failed to initialize private notes service', {
        title: 'Initialization Error'
      });
      return false;
    }
  }, [pnsInitialized]);

  // Load notes from PnsService
  const loadNotes = useCallback(async () => {
    setIsLoading(true);
    try {
      const initialized = await initializePns();
      if (!initialized) {
        setIsLoading(false);
        return;
      }

      const { PnsService } = await import('../../lib/nostr/pns/pns-service');
      const pns = PnsService.getInstance();
      const fetchedNotes = await pns.listNotes({ limit: 50 });

      setNotes(fetchedNotes.map(note => ({
        noteId: note.noteId,
        content: note.content,
        title: note.metadata?.title,
        securityMode: note.securityMode,
        // Security tier is stored per-service config, not per-note metadata
        securityTier: undefined,
        createdAt: note.createdAt,
        tags: note.metadata?.tags
      })));
    } catch (error) {
      console.error('[Note2Self] Failed to load notes:', error);
      showToast.error('Failed to load private notes', { title: 'Load Error' });
    } finally {
      setIsLoading(false);
    }
  }, [initializePns]);

  // Load notes on mount
  useEffect(() => {
    if (isOpen && view === 'list') {
      void loadNotes();
    }
  }, [isOpen, view, loadNotes]);

  // Reset form on close
  useEffect(() => {
    if (!isOpen) {
      setNoteContent('');
      setNoteTitle('');
      setNoteTags([]);
      setTagInput('');
      setSecurityMode(clientConfig.flags.pnsDefaultSecurityMode);
      setSecurityTier(clientConfig.flags.pnsDefaultSecurityTier);
    }
  }, [isOpen]);

  // Save note handler
  const handleSaveNote = async () => {
    if (!noteContent.trim()) {
      showToast.warning('Please enter note content', { title: 'Validation' });
      return;
    }

    setIsLoading(true);
    try {
      const initialized = await initializePns();
      if (!initialized) {
        setIsLoading(false);
        return;
      }

      const { PnsService } = await import('../../lib/nostr/pns/pns-service');
      const pns = PnsService.getInstance();

      const metadata: Partial<PnsNoteMetadata> = {
        title: noteTitle || undefined,
        tags: noteTags.length > 0 ? noteTags : undefined,
        createdAt: Date.now(),
      };

      // Add ephemeral policy if ephemeral tier selected
      if (securityTier === 'ephemeral-standard' && securityMode === 'noise-fs') {
        metadata.ephemeralPolicy = {
          isEphemeral: true,
          expiresAt: Date.now() + ephemeralTtl * 1000,
          ttlSeconds: ephemeralTtl
        };
      }
      // Note: securityTier is configured at the PnsService level, not per-note metadata

      await pns.saveNote(noteContent, metadata, securityMode);

      showToast.success('Private note saved successfully', { title: 'Saved' });

      // Reset form
      setNoteContent('');
      setNoteTitle('');
      setNoteTags([]);

      // Switch to list view to show saved note
      setView('list');
      await loadNotes();
    } catch (error) {
      console.error('[Note2Self] Failed to save note:', error);
      showToast.error(
        error instanceof Error ? error.message : 'Failed to save note',
        { title: 'Save Error' }
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Delete note handler
  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note?')) return;

    setIsLoading(true);
    try {
      const { PnsService } = await import('../../lib/nostr/pns/pns-service');
      const pns = PnsService.getInstance();
      await pns.deleteNote(noteId);

      showToast.success('Note deleted', { title: 'Deleted' });
      setNotes(notes.filter(n => n.noteId !== noteId));
    } catch (error) {
      console.error('[Note2Self] Failed to delete note:', error);
      showToast.error('Failed to delete note', { title: 'Delete Error' });
    } finally {
      setIsLoading(false);
    }
  };

  // Add tag handler
  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !noteTags.includes(tag)) {
      setNoteTags([...noteTags, tag]);
      setTagInput('');
    }
  };

  // Format date - handles both seconds and milliseconds timestamps
  const formatDate = (timestamp: number) => {
    // Detect if timestamp is in seconds (< 1e12) or milliseconds (>= 1e12)
    const ms = timestamp > 1e12 ? timestamp : timestamp * 1000;
    return new Date(ms).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📒</span>
            <h2 className="text-xl font-semibold text-gray-900">Note2Self</h2>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex rounded-lg bg-gray-100 p-1">
              <button
                onClick={() => setView('compose')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${view === 'compose'
                  ? 'bg-white text-amber-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                ✏️ Compose
              </button>
              <button
                onClick={() => { setView('list'); void loadNotes(); }}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${view === 'list'
                  ? 'bg-white text-amber-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                📋 My Notes
              </button>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Close modal"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {view === 'compose' ? (
            /* Compose View */
            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title (optional)
                </label>
                <input
                  type="text"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="Enter a title for your note..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Note Content
                </label>
                <textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Write your private note..."
                  rows={6}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-none"
                />
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tags (optional)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                    placeholder="Add a tag..."
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                  <button
                    onClick={handleAddTag}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Add
                  </button>
                </div>
                {noteTags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {noteTags.map(tag => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-800 rounded-full text-sm"
                      >
                        #{tag}
                        <button
                          onClick={() => setNoteTags(noteTags.filter(t => t !== tag))}
                          className="text-amber-600 hover:text-amber-800"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Security Mode */}
              <div className="bg-gray-50 rounded-lg p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  🔐 Security Mode
                </label>
                <div className="space-y-2">
                  <label className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-amber-300 transition-colors">
                    <input
                      type="radio"
                      name="securityMode"
                      value="none"
                      checked={securityMode === 'none'}
                      onChange={() => setSecurityMode('none')}
                      className="mt-1 text-amber-600 focus:ring-amber-500"
                    />
                    <div>
                      <div className="font-medium text-gray-900">{SECURITY_MODE_LABELS['none'].label}</div>
                      <div className="text-sm text-gray-500">{SECURITY_MODE_LABELS['none'].description}</div>
                    </div>
                  </label>

                  <label className={`flex items-start gap-3 p-3 bg-white rounded-lg border cursor-pointer transition-colors ${noiseFsAvailable
                    ? 'border-gray-200 hover:border-amber-300'
                    : 'border-gray-100 opacity-50 cursor-not-allowed'
                    }`}>
                    <input
                      type="radio"
                      name="securityMode"
                      value="noise-fs"
                      checked={securityMode === 'noise-fs'}
                      onChange={() => noiseFsAvailable && setSecurityMode('noise-fs')}
                      disabled={!noiseFsAvailable}
                      className="mt-1 text-amber-600 focus:ring-amber-500"
                    />
                    <div>
                      <div className="font-medium text-gray-900">
                        {SECURITY_MODE_LABELS['noise-fs'].label}
                        {!noiseFsAvailable && (
                          <span className="ml-2 text-xs text-gray-400">(Experimental flag disabled)</span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">{SECURITY_MODE_LABELS['noise-fs'].description}</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Security Tier (only for Noise-FS mode) */}
              {securityMode === 'noise-fs' && noiseFsAvailable && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    🛡️ Security Tier
                  </label>
                  <select
                    value={securityTier}
                    onChange={(e) => setSecurityTier(e.target.value as NoiseSecurityTier)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  >
                    {Object.entries(SECURITY_TIER_LABELS).map(([tier, { label, description }]) => (
                      <option key={tier} value={tier}>
                        {label} - {description}
                      </option>
                    ))}
                  </select>

                  {/* Ephemeral TTL */}
                  {securityTier === 'ephemeral-standard' && (
                    <div className="mt-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        ⏱️ Time to Live
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={Math.floor(ephemeralTtl / 86400)}
                          onChange={(e) => setEphemeralTtl(Math.max(1, parseInt(e.target.value) || 1) * 86400)}
                          min={1}
                          max={365}
                          className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                        />
                        <span className="text-gray-600">days</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* List View */
            <div className="space-y-3">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600"></div>
                </div>
              ) : notes.length === 0 ? (
                <div className="text-center py-12">
                  <span className="text-4xl mb-3 block">📝</span>
                  <p className="text-gray-500">No private notes yet</p>
                  <button
                    onClick={() => setView('compose')}
                    className="mt-4 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
                  >
                    Create your first note
                  </button>
                </div>
              ) : (
                notes.map(note => (
                  <div
                    key={note.noteId}
                    className="p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-amber-300 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 truncate">
                          {note.title || note.content.slice(0, 50) + (note.content.length > 50 ? '...' : '')}
                        </h3>
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">{note.content}</p>
                        <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                          <span>{formatDate(note.createdAt)}</span>
                          <span className={`px-1.5 py-0.5 rounded ${note.securityMode === 'noise-fs' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                            }`}>
                            {note.securityMode === 'noise-fs' ? '🔐 Forward Secure' : '🔒 Standard'}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteNote(note.noteId)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete note"
                        aria-label="Delete note"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {view === 'compose' && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveNote}
              disabled={isLoading || !noteContent.trim()}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${isLoading || !noteContent.trim()
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-amber-500 text-white hover:bg-amber-600'
                }`}
            >
              {isLoading ? 'Saving...' : '💾 Save Note'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Note2SelfModal;

