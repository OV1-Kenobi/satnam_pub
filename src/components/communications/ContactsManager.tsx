/**
 * ContactsManager Component
 * 
 * Sophisticated contacts interface with:
 * - Contact cards showing trust levels and relationship types
 * - Search and filtering by name, nip05, and notes
 * - Add/edit contact forms with all metadata fields
 * - Trust level badges with color coding
 * - Gift Wrap support indicators
 * - Family role assignments
 * - Contact verification status
 * 
 * Integrates with existing Supabase database and SSS trust system.
 */

import { useMemo, useState } from 'react';
import { useContacts } from '../../hooks/useGiftWrappedCommunications';
import {
    Contact,
    RelationshipType,
    TrustLevel
} from '../../lib/gift-wrapped-messaging/comprehensive-service';

// Trust level configuration with colors and descriptions
const TRUST_LEVELS = {
  [TrustLevel.FAMILY]: {
    label: 'Family',
    color: 'bg-green-100 text-green-800 border-green-300',
    icon: '👨‍👩‍👧‍👦',
    description: 'Immediate family members with highest trust'
  },
  [TrustLevel.TRUSTED]: {
    label: 'Trusted',
    color: 'bg-blue-100 text-blue-800 border-blue-300',
    icon: '🤝',
    description: 'Close friends, advisors, and trusted contacts'
  },
  [TrustLevel.KNOWN]: {
    label: 'Known',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    icon: '👤',
    description: 'Known associates and acquaintances'
  },
  [TrustLevel.UNVERIFIED]: {
    label: 'Unverified',
    color: 'bg-gray-100 text-gray-800 border-gray-300',
    icon: '❓',
    description: 'New or unverified contacts'
  }
};

// Relationship type configuration
const RELATIONSHIP_TYPES = {
  [RelationshipType.PARENT]: { label: 'Parent', icon: '👨‍👩‍👧‍👦' },
  [RelationshipType.CHILD]: { label: 'Child', icon: '🧒' },
  [RelationshipType.GUARDIAN]: { label: 'Guardian', icon: '🛡️' },
  [RelationshipType.ADVISOR]: { label: 'Advisor', icon: '💼' },
  [RelationshipType.FRIEND]: { label: 'Friend', icon: '👫' },
  [RelationshipType.BUSINESS]: { label: 'Business', icon: '🏢' },
  [RelationshipType.FAMILY_ASSOCIATE]: { label: 'Family Associate', icon: '👥' }
};

interface ContactsManagerProps {
  onSelectContact?: (contact: Contact) => void;
  selectedContactId?: string;
  showAddButton?: boolean;
  compact?: boolean;
}

export function ContactsManager({ 
  onSelectContact, 
  selectedContactId, 
  showAddButton = true,
  compact = false 
}: ContactsManagerProps) {
  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTrust, setFilterTrust] = useState<TrustLevel | 'all'>('all');
  const [filterRelationship, setFilterRelationship] = useState<RelationshipType | 'all'>('all');
  const [filterGiftWrap, setFilterGiftWrap] = useState<boolean | 'all'>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  // Hook for contacts management
  const { contacts, loading, error, addContact, updateContact, deleteContact, refreshContacts } = useContacts();

  // Filtered and sorted contacts
  const filteredContacts = useMemo(() => {
    return contacts
      .filter(contact => {
        // Search filter
        if (searchTerm) {
          const search = searchTerm.toLowerCase();
          const matchesSearch = 
            contact.displayName?.toLowerCase().includes(search) ||
            contact.username?.toLowerCase().includes(search) ||
            contact.nip05?.toLowerCase().includes(search) ||
            contact.notes?.toLowerCase().includes(search) ||
            contact.npub.toLowerCase().includes(search);
          
          if (!matchesSearch) return false;
        }

        // Trust level filter
        if (filterTrust !== 'all' && contact.trustLevel !== filterTrust) {
          return false;
        }

        // Relationship type filter
        if (filterRelationship !== 'all' && contact.relationshipType !== filterRelationship) {
          return false;
        }

        // Gift Wrap support filter
        if (filterGiftWrap !== 'all' && contact.supportsGiftWrap !== filterGiftWrap) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Sort by trust level first (family first), then by last interaction
        const trustOrder = [TrustLevel.FAMILY, TrustLevel.TRUSTED, TrustLevel.KNOWN, TrustLevel.UNVERIFIED];
        const aTrustIndex = trustOrder.indexOf(a.trustLevel);
        const bTrustIndex = trustOrder.indexOf(b.trustLevel);
        
        if (aTrustIndex !== bTrustIndex) {
          return aTrustIndex - bTrustIndex;
        }

        // Then by last interaction
        const aTime = a.lastInteraction?.getTime() || 0;
        const bTime = b.lastInteraction?.getTime() || 0;
        return bTime - aTime;
      });
  }, [contacts, searchTerm, filterTrust, filterRelationship, filterGiftWrap]);

  // Contact card component
  const ContactCard = ({ contact }: { contact: Contact }) => {
    const isSelected = selectedContactId === contact.id;
    const trustConfig = TRUST_LEVELS[contact.trustLevel];
    const relationshipConfig = RELATIONSHIP_TYPES[contact.relationshipType];

    return (
      <div
        key={contact.id}
        onClick={() => onSelectContact?.(contact)}
        className={`p-4 border rounded-lg cursor-pointer transition-all duration-200 ${
          isSelected 
            ? 'border-purple-300 bg-purple-50 shadow-md' 
            : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
        } ${compact ? 'p-3' : 'p-4'}`}
      >
        {/* Header with name and verification status */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <h3 className={`font-semibold text-gray-900 truncate ${compact ? 'text-sm' : 'text-base'}`}>
                {contact.displayName || contact.username || 'Unknown'}
              </h3>
              {contact.verified && (
                <div className="flex-shrink-0">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    ✓ Verified
                  </span>
                </div>
              )}
            </div>
            {contact.nip05 && (
              <p className={`text-gray-500 truncate ${compact ? 'text-xs' : 'text-sm'}`}>
                {contact.nip05}
              </p>
            )}
          </div>
          
          {/* Gift Wrap indicator */}
          <div className="flex-shrink-0 ml-2">
            {contact.supportsGiftWrap ? (
              <div className="w-3 h-3 bg-purple-500 rounded-full" title="Supports Gift Wrap" />
            ) : (
              <div className="w-3 h-3 bg-gray-300 rounded-full" title="No Gift Wrap support" />
            )}
          </div>
        </div>

        {/* Trust level and relationship badges */}
        <div className="flex items-center space-x-2 mb-2">
          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${trustConfig.color}`}>
            <span className="mr-1">{trustConfig.icon}</span>
            {trustConfig.label}
          </span>
          
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-300">
            <span className="mr-1">{relationshipConfig.icon}</span>
            {relationshipConfig.label}
          </span>
        </div>

        {/* Notes preview */}
        {contact.notes && !compact && (
          <p className="text-sm text-gray-600 line-clamp-2 mb-2">
            {contact.notes}
          </p>
        )}

        {/* Metadata */}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            Added {contact.addedAt.toLocaleDateString()}
          </span>
          {contact.lastInteraction && (
            <span>
              Last interaction {contact.lastInteraction.toLocaleDateString()}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-end space-x-2 mt-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditingContact(contact);
            }}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm('Are you sure you want to delete this contact?')) {
                deleteContact(contact.id);
              }
            }}
            className="text-red-600 hover:text-red-800 text-sm font-medium"
          >
            Delete
          </button>
        </div>
      </div>
    );
  };

  // Add/Edit form component
  const ContactForm = ({ 
    contact, 
    onSave, 
    onCancel 
  }: { 
    contact?: Contact; 
    onSave: () => void; 
    onCancel: () => void; 
  }) => {
    const [formData, setFormData] = useState({
      npub: contact?.npub || '',
      username: contact?.username || '',
      displayName: contact?.displayName || '',
      nip05: contact?.nip05 || '',
      notes: contact?.notes || '',
      trustLevel: contact?.trustLevel || TrustLevel.UNVERIFIED,
      relationshipType: contact?.relationshipType || RelationshipType.FRIEND,
      verified: contact?.verified || false,
      metadata: {
        lightningAddress: contact?.metadata?.lightningAddress || '',
        website: contact?.metadata?.website || '',
        about: contact?.metadata?.about || '',
        picture: contact?.metadata?.picture || ''
      }
    });

    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
      if (!formData.npub.trim()) {
        alert('npub is required');
        return;
      }

      setSaving(true);
      try {
        if (contact) {
          // Update existing contact
          await updateContact(contact.id, formData);
        } else {
          // Add new contact
          await addContact(formData);
        }
        onSave();
      } catch (error) {
        alert('Failed to save contact');
      } finally {
        setSaving(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">
                {contact ? 'Edit Contact' : 'Add New Contact'}
              </h2>
              <button
                onClick={onCancel}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="text-2xl">×</span>
              </button>
            </div>

            <div className="space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    npub (Public Key) *
                  </label>
                  <input
                    type="text"
                    value={formData.npub}
                    onChange={(e) => setFormData(prev => ({ ...prev, npub: e.target.value }))}
                    placeholder="npub1..."
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    disabled={!!contact} // Don't allow editing npub for existing contacts
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                    placeholder="username"
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={formData.displayName}
                    onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                    placeholder="Display name"
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    NIP-05 Address
                  </label>
                  <input
                    type="text"
                    value={formData.nip05}
                    onChange={(e) => setFormData(prev => ({ ...prev, nip05: e.target.value }))}
                    placeholder="user@domain.com"
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Trust Level and Relationship */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Trust Level
                  </label>
                  <select
                    value={formData.trustLevel}
                    onChange={(e) => setFormData(prev => ({ ...prev, trustLevel: e.target.value as TrustLevel }))}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    {Object.entries(TRUST_LEVELS).map(([level, config]) => (
                      <option key={level} value={level}>
                        {config.icon} {config.label} - {config.description}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Relationship Type
                  </label>
                  <select
                    value={formData.relationshipType}
                    onChange={(e) => setFormData(prev => ({ ...prev, relationshipType: e.target.value as RelationshipType }))}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    {Object.entries(RELATIONSHIP_TYPES).map(([type, config]) => (
                      <option key={type} value={type}>
                        {config.icon} {config.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Personal notes about this contact..."
                  rows={3}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Metadata */}
              <div className="space-y-3">
                <h4 className="font-medium text-gray-900">Additional Information</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Lightning Address
                    </label>
                    <input
                      type="text"
                      value={formData.metadata.lightningAddress}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        metadata: { ...prev.metadata, lightningAddress: e.target.value }
                      }))}
                      placeholder="user@domain.com"
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Website
                    </label>
                    <input
                      type="url"
                      value={formData.metadata.website}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        metadata: { ...prev.metadata, website: e.target.value }
                      }))}
                      placeholder="https://..."
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    About
                  </label>
                  <textarea
                    value={formData.metadata.about}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      metadata: { ...prev.metadata, about: e.target.value }
                    }))}
                    placeholder="Brief description..."
                    rows={2}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                  />
                </div>
              </div>

              {/* Verification Status */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="verified"
                  checked={formData.verified}
                  onChange={(e) => setFormData(prev => ({ ...prev, verified: e.target.checked }))}
                  className="w-4 h-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                />
                <label htmlFor="verified" className="ml-2 text-sm font-medium text-gray-700">
                  Verified Contact
                </label>
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex items-center justify-end space-x-3 mt-8 pt-6 border-t border-gray-200">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formData.npub.trim()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
              >
                {saving ? 'Saving...' : (contact ? 'Update Contact' : 'Add Contact')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Contacts</h2>
            <p className="text-sm text-gray-600 mt-1">
              Manage your trusted contacts with privacy-first communications
            </p>
          </div>
          
          {showAddButton && (
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Add Contact
            </button>
          )}
        </div>

        {/* Search and Filters */}
        <div className="space-y-3">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search contacts by name, username, nip05, or notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <div className="absolute left-3 top-2.5 text-gray-400">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M12.9 14.32a8 8 0 111.414-1.414l4.387 4.387a1 1 0 01-1.414 1.414l-4.387-4.387zM8 14A6 6 0 108 2a6 6 0 000 12z" clipRule="evenodd" />
              </svg>
            </div>
          </div>

          {/* Filters */}
          {!compact && (
            <div className="flex flex-wrap gap-3">
              <select
                value={filterTrust}
                onChange={(e) => setFilterTrust(e.target.value as TrustLevel | 'all')}
                className="px-3 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="all">All Trust Levels</option>
                {Object.entries(TRUST_LEVELS).map(([level, config]) => (
                  <option key={level} value={level}>
                    {config.icon} {config.label}
                  </option>
                ))}
              </select>

              <select
                value={filterRelationship}
                onChange={(e) => setFilterRelationship(e.target.value as RelationshipType | 'all')}
                className="px-3 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="all">All Relationships</option>
                {Object.entries(RELATIONSHIP_TYPES).map(([type, config]) => (
                  <option key={type} value={type}>
                    {config.icon} {config.label}
                  </option>
                ))}
              </select>

              <select
                value={filterGiftWrap}
                onChange={(e) => setFilterGiftWrap(e.target.value === 'all' ? 'all' : e.target.value === 'true')}
                className="px-3 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="all">All Contacts</option>
                <option value="true">Gift Wrap Supported</option>
                <option value="false">No Gift Wrap</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <div className="flex">
              <div className="text-red-400 mr-2">⚠️</div>
              <div>
                <h3 className="text-sm font-medium text-red-800">Error loading contacts</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
                <button
                  onClick={refreshContacts}
                  className="text-sm text-red-600 hover:text-red-800 font-medium mt-2"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredContacts.length === 0 && (
          <div className="text-center py-8">
            <div className="text-6xl mb-4">👥</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {contacts.length === 0 ? 'No contacts yet' : 'No contacts match your filters'}
            </h3>
            <p className="text-gray-500 mb-4">
              {contacts.length === 0 
                ? 'Add your first contact to start private communications' 
                : 'Try adjusting your search or filters'
              }
            </p>
            {contacts.length === 0 && showAddButton && (
              <button
                onClick={() => setShowAddForm(true)}
                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
              >
                Add Your First Contact
              </button>
            )}
          </div>
        )}

        {/* Contacts Grid */}
        {!loading && !error && filteredContacts.length > 0 && (
          <div className={`grid gap-4 ${compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
            {filteredContacts.map(contact => (
              <ContactCard key={contact.id} contact={contact} />
            ))}
          </div>
        )}

        {/* Summary */}
        {!loading && !error && filteredContacts.length > 0 && (
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>
                Showing {filteredContacts.length} of {contacts.length} contacts
              </span>
              <div className="flex items-center space-x-4">
                <span className="flex items-center space-x-1">
                  <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                  <span>Gift Wrap: {contacts.filter(c => c.supportsGiftWrap).length}</span>
                </span>
                <span className="flex items-center space-x-1">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span>Verified: {contacts.filter(c => c.verified).length}</span>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Form Modal */}
      {showAddForm && (
        <ContactForm
          onSave={() => setShowAddForm(false)}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {editingContact && (
        <ContactForm
          contact={editingContact}
          onSave={() => setEditingContact(null)}
          onCancel={() => setEditingContact(null)}
        />
      )}
    </div>
  );
}