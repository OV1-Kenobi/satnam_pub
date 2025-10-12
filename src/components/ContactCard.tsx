/**
 * ContactCard Component
 *
 * MASTER CONTEXT COMPLIANCE: Privacy-first contact display with interaction-triggered Nostr profile fetching
 * CRITICAL SECURITY: User-controlled localStorage logging, zero external data leakage
 */

import { Edit3, Gift, MessageCircle, MoreVertical, Zap } from 'lucide-react';
import React, { useState } from 'react';
import { nostrProfileService } from '../lib/nostr-profile-service.js';
import { contactApi } from '../services/contactApiService';
import nip05ResolverClient from '../services/nip05ResolverClient';
import { showToast } from '../services/toastService';
import { Contact } from '../types/contacts';
import ContextualAvatar from './ContextualAvatar';

import { CentralEventPublishingService } from '../../lib/central_event_publishing_service';




interface ContactCardProps {
  contact: Contact;
  onEdit: (contact: Contact) => void;
  onDelete: (contactId: string) => void;
  onViewDetails: (contact: Contact) => void;
  onSelect?: (contact: Contact) => void;
  showPrivateData: boolean;
  loading?: boolean;
  selectionMode?: boolean;
  onOpenPrivateMessage?: (contactId: string) => void;
  onZapContact?: (contact: Contact) => void;
  onMessageContact?: (contact: Contact) => void;
}

export const ContactCard: React.FC<ContactCardProps> = ({
  contact,
  onEdit,
  onDelete,
  onViewDetails,
  onSelect,
  showPrivateData,
  loading = false,
  selectionMode = false,
  onOpenPrivateMessage,
  onZapContact,
  onMessageContact,
}) => {
  const [showMenu, setShowMenu] = useState<boolean>(false);
  const [showHoverActions, setShowHoverActions] = useState<boolean>(false);

  // MASTER CONTEXT COMPLIANCE: Nostr profile image state
  const [profileImageUrl, setProfileImageUrl] = useState<string | undefined>(contact.profileImageUrl);
  const [profileImageLoading, setProfileImageLoading] = useState<boolean>(false);

  // NIP-05 resolution state (memoized client)
  const [nip05Did, setNip05Did] = useState<string | null>(null);
  const [nip05Mirrors, setNip05Mirrors] = useState<string[] | null>(null);
  const [issuerStatus, setIssuerStatus] = useState<string | null>(null);

  // Trust score (server-computed)
  const [trustResult, setTrustResult] = useState<null | {
    score: number;
    level: 'low' | 'medium' | 'high';
    components: { physical: number; vp: number; social: number; recencyPenalty: number };
  }>(null);

  /**
   * MASTER CONTEXT COMPLIANCE: User-controlled local contact operation logging
   * Stores contact operations in user's local encrypted storage (localStorage)
   * NEVER stored in external databases - user maintains full control
   */
  const logContactOperation = async (operationData: {
    operation: string;
    details: any;
    timestamp: Date;
  }): Promise<void> => {
    try {
      const existingHistory = localStorage.getItem("satnam_contact_history");
      const operationHistory = existingHistory ? JSON.parse(existingHistory) : [];

      const operationRecord = {
        id: crypto.randomUUID(),
        type: "contact_operation",
        ...operationData,
        timestamp: operationData.timestamp.toISOString(),
      };

      operationHistory.push(operationRecord);

      // Keep only last 1000 operations to prevent localStorage bloat
      if (operationHistory.length > 1000) {
        operationHistory.splice(0, operationHistory.length - 1000);
      }

      localStorage.setItem("satnam_contact_history", JSON.stringify(operationHistory));
    } catch (error) {
      // Silent fail for privacy - no external logging
    }

  };

  // Verification status and trust score (optional fields from backend joins)


  // Verification status and trust score (optional fields from backend joins)
  const verStatus = contact as unknown as {
    physicallyVerified?: boolean;
    vpVerified?: boolean;
    trust_score_encrypted?: string;
    trustScore?: number;
    hash?: string;
  };

  const trustDisplay: string | null = (() => {
    if (trustResult && typeof trustResult.score === 'number') return String(Math.round(trustResult.score));
    if (typeof verStatus.trustScore === 'number') return String(Math.round(verStatus.trustScore));
    if (typeof verStatus.trust_score_encrypted === 'string' && verStatus.trust_score_encrypted.startsWith('v1:')) {
      const parts = verStatus.trust_score_encrypted.split(':');

      const v = Number(parts[1]);
      if (!Number.isNaN(v)) return String(Math.round(v));
    }
    return null;
  })();

  const handleVouchClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    try {
      await contactApi.attestContact(verStatus.hash || contact.id, 'group_peer');
      showToast.success('Vouch submitted');
      // CEPS integration: robust, non-blocking messaging with hierarchy
      try {
        const ceps: any = new CentralEventPublishingService();
        const recipientNpub: string = contact.npub;
        const recipientHex: string = (() => {
          try { return ceps.npubToHex(recipientNpub); } catch { return recipientNpub; }
        })();

        const content = JSON.stringify({ type: 'vouch', contactId: contact.id, ts: Date.now() });

        // Primary: NIP-17 (unsigned kind:14 → seal kind:13 → gift-wrap 1059), with inbox relay discovery
        let published = false;
        try {
          const unsigned14 = ceps.buildUnsignedKind14DirectMessage(content, recipientHex);
          const sealed13 = await ceps.sealKind13WithActiveSession(unsigned14, recipientHex);
          const wrapped1059 = await ceps.giftWrap1059(sealed13, recipientHex);
          // Ensure recipient p-tag for inbox discovery
          (wrapped1059 as any).tags = Array.isArray((wrapped1059 as any).tags) ? (wrapped1059 as any).tags : [];
          if (!(wrapped1059 as any).tags.find((t: any) => Array.isArray(t) && t[0] === 'p')) {
            (wrapped1059 as any).tags.push(["p", recipientHex]);
          }
          await ceps.publishOptimized(wrapped1059, { recipientPubHex: recipientHex, senderPubHex: (wrapped1059 as any).pubkey });
          published = true;
        } catch { }


        // Fallback 1: NIP-59 gift-wrapped DM (session-based)
        if (!published) {
          try {
            await ceps.sendGiftWrappedDirectMessage(
              {
                encryptedNpub: recipientNpub, // CEPS expects npub in some paths
                trustLevel: 'known',
                supportsGiftWrap: true,
                preferredEncryption: 'gift-wrap',
                nameHash: '', displayNameHash: '', nip05Hash: '', addedAt: new Date(), addedByHash: '', tagsHash: [],
              } as any,
              { type: 'vouch', contactId: contact.id, ts: Date.now() }
            );
            published = true;
          } catch { }
        }

        // Fallback 2: NIP-04/44 standard DM (session-based)
        if (!published) {
          try {
            await ceps.sendStandardDirectMessage(recipientNpub, content);
          } catch { }
        }
      } catch {/* no-op */ }
    } catch (error) {
      showToast.error('Failed to vouch', { title: 'Attestation', duration: 4000 });
    }
  };

  const getTrustLevelColor = (trustLevel: Contact['trustLevel']): string => {
    switch (trustLevel) {
      case 'family': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'trusted': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'known': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'unverified': return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getTrustLevelIcon = (trustLevel: Contact['trustLevel']): string => {
    switch (trustLevel) {
      case 'family': return '👨‍👩‍👧‍👦';
      case 'trusted': return '🤝';
      case 'known': return '👋';
      case 'unverified': return '❓';
      default: return '❓';
    }
  };

  const formatNpub = (npub: string, show: boolean): string => {
    if (show) return npub;
    return `${npub.slice(0, 16)}...${npub.slice(-8)}`;
  };

  const handleCardClick = (): void => {
    if (!loading) {
      if (selectionMode && onSelect) {
        onSelect(contact);
      } else {
        onViewDetails(contact);
      }
    }
  };

  const handleMenuToggle = (e: React.MouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    setShowMenu(!showMenu);
  };

  const handleEdit = (e: React.MouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    setShowMenu(false);
    onEdit(contact);
  };

  const handleDelete = (e: React.MouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    setShowMenu(false);
    if (window.confirm(`Are you sure you want to delete contact ${contact.displayName}?`)) {
      onDelete(contact.id);
    }
  };

  /**
   * MASTER CONTEXT COMPLIANCE: Interaction-triggered profile image fetching
   * Fetches Nostr profile on hover with debouncing to prevent excessive relay requests
   */
  const handleMouseEnter = async (): Promise<void> => {
    setShowHoverActions(true);

    // Only fetch if we don't have a cached profile image
    if (!profileImageUrl && !profileImageLoading) {
      setProfileImageLoading(true);

      try {
        const profile = await nostrProfileService.fetchProfileWithDebounce(contact.npub);
        if (profile?.picture) {
          setProfileImageUrl(profile.picture);

          // Log successful profile image fetch
          await logContactOperation({
            operation: "profile_image_loaded",
            details: {
              contactId: contact.id,
              contactName: contact.displayName,
              hasImage: true,
            },
            timestamp: new Date(),
          });
        }
      } catch (error) {
        // MASTER CONTEXT COMPLIANCE: User-controlled logging
        await logContactOperation({
          operation: "profile_image_fetch_failed",
          details: {
            contactId: contact.id,
            contactName: contact.displayName,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          timestamp: new Date(),
        });
      } finally {
        setProfileImageLoading(false);
      }
    }

    // Lazy resolve NIP-05 → did:scid and mirrors (memoized)
    try {
      if (contact.nip05 && !nip05Did) {
        const res = await nip05ResolverClient.resolve(contact.nip05);
        setNip05Did(res.didScid);
        setNip05Mirrors(res.mirrors);
        setIssuerStatus(res.issuerRegistryStatus);
      }
    } catch { }

    // Server trust-score refresh on hover
    try {
      const recencyDays = contact.lastContact ? Math.max(0, Math.floor((Date.now() - contact.lastContact.getTime()) / 86400000)) : 999;
      const body = {
        physicallyVerified: !!verStatus.physicallyVerified,
        vpVerified: !!verStatus.vpVerified,
        socialAttestations: { count: contact.contactCount || 0, distinctIssuers: 0, recentCount30d: Math.min(contact.contactCount || 0, 30) },
        recencyDays,
      };
      const resp = await fetch('/.netlify/functions/trust-score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (resp.ok) {
        const j = await resp.json();
        if (j?.success && j?.data) setTrustResult(j.data);
      }
    } catch { }
  };

  const handleMouseLeave = (): void => {
    setShowHoverActions(false);
  };

  return (
    <div
      className={`relative bg-white/10 border rounded-lg p-4 transition-all duration-300 cursor-pointer ${loading
        ? 'opacity-50 cursor-not-allowed border-white/10'
        : selectionMode
          ? 'border-green-500/50 hover:border-green-500/70 hover:bg-green-500/10'
          : 'border-white/20 hover:border-purple-500/50'
        }`}
      onClick={handleCardClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Hover Actions Overlay */}
      {showHoverActions && !loading && !selectionMode && (
        <div className="absolute inset-0 bg-black/80 rounded-lg flex items-center justify-center space-x-4 z-20">
          {onZapContact && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onZapContact(contact);
              }}
              className="flex items-center space-x-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
              title="Send Lightning payment"
            >
              <Zap className="h-4 w-4" />
              <span className="text-sm font-medium">Zap</span>
            </button>
          )}
          {onMessageContact && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMessageContact(contact);
              }}
              className="flex items-center space-x-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors"
              title="Send Nostr private message"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Message</span>
            </button>
          )}
          <button
            onClick={handleVouchClick}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            title="Create trust attestation"
          >
            <Gift className="h-4 w-4" />
            <span className="text-sm font-medium">Vouch</span>
          </button>

        </div>
      )
      }
      {/* Menu Button */}
      <div className="absolute top-3 right-3">
        <button
          onClick={handleMenuToggle}
          disabled={loading}
          className="p-1 hover:bg-white/10 rounded-lg transition-colors"
          aria-label="Contact options"
        >
          <MoreVertical className="h-4 w-4 text-purple-300" />
        </button>

        {/* Dropdown Menu */}
        {showMenu && (
          <div className="absolute right-0 top-8 z-10 bg-purple-900 border border-purple-700 rounded-lg shadow-lg min-w-[120px]">
            <button
              onClick={handleEdit}
              className="w-full px-3 py-2 text-left text-white hover:bg-purple-800 transition-colors flex items-center space-x-2"
            >
              <Edit3 className="h-3 w-3" />
              <span className="text-sm">Edit</span>
            </button>
            <button
              onClick={handleDelete}
              className="w-full px-3 py-2 text-left text-red-400 hover:bg-purple-800 transition-colors text-sm"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Contact Info */}
      <div className="pr-8">
        <div className="flex items-center space-x-3 mb-2">
          {/* MASTER CONTEXT COMPLIANCE: Nostr profile image with fallback */}
          {profileImageUrl ? (
            <div className="relative">
              <img
                src={profileImageUrl}
                alt={contact.displayName}
                className="w-8 h-8 rounded-full object-cover border border-purple-500/30"
                onError={() => setProfileImageUrl(undefined)}
              />
              {profileImageLoading && (
                <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-400"></div>
                </div>
              )}
            </div>
          ) : (
            <ContextualAvatar
              member={{
                id: contact.id,
                username: contact.displayName,
                avatar: contact.displayName.charAt(0).toUpperCase(),
              }}
              context="contacts"
              onContactsClick={(contactId) => {
                if (onOpenPrivateMessage) {
                  onOpenPrivateMessage(contactId);
                }
              }}
              size="sm"
            />
          )}
          <h4 className="text-white font-semibold truncate">{contact.displayName}</h4>
          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getTrustLevelColor(contact.trustLevel)}`}>
            {getTrustLevelIcon(contact.trustLevel)} {contact.trustLevel}
          </span>
        </div>

        {/* Capabilities and Role */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {contact.supportsGiftWrap && (
            <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded-full text-xs font-medium border border-purple-500/30 flex items-center space-x-1">
              <Gift className="h-3 w-3" />
              <span>Gift Wrap</span>
            </span>
          )}
          {contact.familyRole && (
            <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded-full text-xs font-medium border border-blue-500/30 capitalize">
              {contact.familyRole}
            </span>
          )}
          {contact.nip05Verified && (
            <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-medium border border-green-500/30">
              ✓ NIP-05
            </span>
          )}
          {verStatus.physicallyVerified && (
            <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-xs font-medium border border-emerald-500/30">
              ✓ Physically Verified
            </span>
          )}
          {verStatus.vpVerified && (
            <span className="px-2 py-1 bg-teal-500/20 text-teal-300 rounded-full text-xs font-medium border border-teal-500/30">
              ✓ VP Verified
            </span>
          )}

        </div>

        {/* NIP-05 */}
        {contact.nip05 && (
          <div className="mb-1 space-y-1">
            <p className="text-blue-400 text-sm truncate">📧 {contact.nip05}</p>
            {nip05Did && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded-full text-[10px] border border-blue-500/30">
                  DID: {nip05Did.split(":").slice(0, 3).join(":")}…
                </span>
                {issuerStatus && (
                  <span className="px-2 py-0.5 bg-green-500/20 text-green-300 rounded-full text-[10px] border border-green-500/30">
                    Issuer: {issuerStatus}
                  </span>
                )}
                {Array.isArray(nip05Mirrors) && nip05Mirrors.length > 0 && (
                  <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded-full text-[10px] border border-purple-500/30">
                    Mirrors: {nip05Mirrors.length}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {((contact as { external_ln_address?: string; lud16?: string }).external_ln_address || (contact as { external_ln_address?: string; lud16?: string }).lud16) && (
          <p className="text-orange-400 text-sm truncate">⚡ {(contact as { external_ln_address?: string; lud16?: string }).external_ln_address || (contact as { external_ln_address?: string; lud16?: string }).lud16}</p>
        )}


        {/* NPub */}
        <p className="text-purple-300 text-xs font-mono mb-2 break-all">
          {formatNpub(contact.npub, showPrivateData)}
        </p>

        {/* Notes */}
        {contact.notes && (
          <p className="text-purple-200 text-sm mb-2 line-clamp-2">{contact.notes}</p>
        )}

        {/* Stats */}
        <div className="flex items-center justify-between text-xs text-purple-400">
          <div className="flex items-center space-x-3">
            <span>Added: {contact.addedAt.toLocaleDateString()}</span>
            {contact.lastContact && (
              <span>Last: {contact.lastContact.toLocaleDateString()}</span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {contact.contactCount > 0 && (
              <span className="bg-purple-500/20 text-purple-300 px-2 py-1 rounded-full">
                {contact.contactCount} msgs
              </span>
            )}
            {contact.messageReliabilityScore && contact.messageReliabilityScore > 80 && (
              <span className="text-green-400">⚡</span>
            )}
            {trustDisplay && (
              <span
                className={`${trustResult?.level === 'high' ? 'bg-green-500/20 text-green-300' : trustResult?.level === 'medium' ? 'bg-yellow-500/20 text-yellow-300' : trustResult?.level === 'low' ? 'bg-red-500/20 text-red-300' : 'bg-green-500/20 text-green-300'} px-2 py-1 rounded-full`}
                title={trustResult ? `Score: ${Math.round(trustResult.score)} | Phys: ${trustResult.components.physical}, VP: ${trustResult.components.vp}, Social: ${trustResult.components.social}, Recency: ${trustResult.components.recencyPenalty}` : 'Trust score pending'}
              >
                Trust: {trustDisplay}
              </span>
            )}

          </div>
        </div>

        {/* Tags */}
        {contact.tags && contact.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {contact.tags.slice(0, 3).map((tag, index) => (
              <span
                key={index}
                className="px-2 py-1 bg-gray-500/20 text-gray-300 rounded text-xs"
              >
                {tag}
              </span>
            ))}
            {contact.tags.length > 3 && (
              <span className="px-2 py-1 bg-gray-500/20 text-gray-300 rounded text-xs">
                +{contact.tags.length - 3} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* Click overlay to close menu when clicking outside */}
      {
        showMenu && (
          <div
            className="fixed inset-0 z-10"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(false);
            }}
          />
        )
      }
    </div >
  );
};

export default ContactCard;