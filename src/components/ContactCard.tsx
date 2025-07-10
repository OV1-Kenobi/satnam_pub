/**
 * ContactCard Component
 * 
 * Individual contact display card for the Privacy-First Contacts system.
 * Compatible with Bolt.new and Netlify serverless deployments.
 */

import { Edit3, Gift, MoreVertical, Zap, MessageCircle } from 'lucide-react';
import React, { useState } from 'react';
import { Contact } from '../types/contacts';
import ContextualAvatar from './ContextualAvatar';

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

  return (
    <div
      className={`relative bg-white/10 border rounded-lg p-4 transition-all duration-300 cursor-pointer ${
        loading 
          ? 'opacity-50 cursor-not-allowed border-white/10' 
          : selectionMode
          ? 'border-green-500/50 hover:border-green-500/70 hover:bg-green-500/10'
          : 'border-white/20 hover:border-purple-500/50'
      }`}
      onClick={handleCardClick}
      onMouseEnter={() => setShowHoverActions(true)}
      onMouseLeave={() => setShowHoverActions(false)}
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
              className="flex items-center space-x-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
              title="Send private message"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Message</span>
            </button>
          )}
        </div>
      )}
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
        </div>

        {/* NIP-05 */}
        {contact.nip05 && (
          <p className="text-blue-400 text-sm mb-1 truncate">📧 {contact.nip05}</p>
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
      {showMenu && (
        <div
          className="fixed inset-0 z-5"
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(false);
          }}
        />
      )}
    </div>
  );
};

export default ContactCard;