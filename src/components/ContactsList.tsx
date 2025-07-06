/**
 * ContactsList Component
 * 
 * Filtered and sorted contact list for the Privacy-First Contacts system.
 * Compatible with Bolt.new and Netlify serverless deployments.
 */

import { Filter, SortAsc, SortDesc, Users } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { Contact, ContactFilters, ContactSortOptions } from '../types/contacts';
import ContactCard from './ContactCard.tsx';

interface ContactsListProps {
  contacts: Contact[];
  onEditContact: (contact: Contact) => void;
  onDeleteContact: (contactId: string) => void;
  onViewContactDetails: (contact: Contact) => void;
  onContactSelect?: (contact: Contact) => void;
  showPrivateData: boolean;
  loading?: boolean;
  searchQuery?: string;
  selectionMode?: boolean;
}

export const ContactsList: React.FC<ContactsListProps> = ({
  contacts,
  onEditContact,
  onDeleteContact,
  onViewContactDetails,
  onContactSelect,
  showPrivateData,
  loading = false,
  searchQuery = '',
  selectionMode = false,
}) => {
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [filters, setFilters] = useState<ContactFilters>({});
  const [sortOptions, setSortOptions] = useState<ContactSortOptions>({
    field: 'displayName',
    direction: 'asc',
  });

  // Filter and sort contacts
  const filteredAndSortedContacts = useMemo(() => {
    let filtered = contacts;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(contact =>
        contact.displayName.toLowerCase().includes(query) ||
        contact.nip05?.toLowerCase().includes(query) ||
        contact.notes?.toLowerCase().includes(query) ||
        contact.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Apply advanced filters
    if (filters.trustLevel) {
      filtered = filtered.filter(contact => contact.trustLevel === filters.trustLevel);
    }

    if (filters.familyRole) {
      filtered = filtered.filter(contact => contact.familyRole === filters.familyRole);
    }

    if (filters.supportsGiftWrap !== undefined) {
      filtered = filtered.filter(contact => contact.supportsGiftWrap === filters.supportsGiftWrap);
    }

    if (filters.verified !== undefined) {
      filtered = filtered.filter(contact => {
        const isVerified = contact.nip05Verified || contact.pubkeyVerified;
        return isVerified === filters.verified;
      });
    }

    // Sort contacts
    filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortOptions.field) {
        case 'displayName':
          aValue = a.displayName.toLowerCase();
          bValue = b.displayName.toLowerCase();
          break;
        case 'addedAt':
          aValue = a.addedAt;
          bValue = b.addedAt;
          break;
        case 'lastContact':
          aValue = a.lastContact || new Date(0);
          bValue = b.lastContact || new Date(0);
          break;
        case 'trustLevel':
          const trustOrder = { family: 0, trusted: 1, known: 2, unverified: 3 };
          aValue = trustOrder[a.trustLevel];
          bValue = trustOrder[b.trustLevel];
          break;
        case 'contactCount':
          aValue = a.contactCount;
          bValue = b.contactCount;
          break;
        default:
          aValue = a.displayName.toLowerCase();
          bValue = b.displayName.toLowerCase();
      }

      if (aValue < bValue) return sortOptions.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOptions.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [contacts, searchQuery, filters, sortOptions]);

  const handleSortChange = (field: ContactSortOptions['field']): void => {
    setSortOptions(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const handleFilterChange = (key: keyof ContactFilters, value: any): void => {
    setFilters(prev => ({
      ...prev,
      [key]: value === '' ? undefined : value,
    }));
  };

  const clearFilters = (): void => {
    setFilters({});
    setSortOptions({ field: 'displayName', direction: 'asc' });
  };

  const activeFiltersCount = Object.values(filters).filter(v => v !== undefined).length;

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-purple-200">Loading contacts...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
        <div className="flex items-center space-x-4">
          {/* Sort Controls */}
          <div className="flex items-center space-x-2">
            <label className="text-sm text-purple-200">Sort by:</label>
            <select
              value={sortOptions.field}
              onChange={(e) => handleSortChange(e.target.value as ContactSortOptions['field'])}
              className="px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
            >
              <option value="displayName" className="bg-purple-900">Name</option>
              <option value="addedAt" className="bg-purple-900">Date Added</option>
              <option value="lastContact" className="bg-purple-900">Last Contact</option>
              <option value="trustLevel" className="bg-purple-900">Trust Level</option>
              <option value="contactCount" className="bg-purple-900">Message Count</option>
            </select>
            <button
              onClick={() => handleSortChange(sortOptions.field)}
              className="p-1 hover:bg-white/10 rounded transition-colors"
              title={`Sort ${sortOptions.direction === 'asc' ? 'descending' : 'ascending'}`}
            >
              {sortOptions.direction === 'asc' ? (
                <SortAsc className="h-4 w-4 text-purple-300" />
              ) : (
                <SortDesc className="h-4 w-4 text-purple-300" />
              )}
            </button>
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center space-x-2 px-3 py-1 rounded-lg transition-colors ${
              showFilters || activeFiltersCount > 0
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                : 'bg-white/10 text-purple-400 hover:bg-white/20'
            }`}
          >
            <Filter className="h-4 w-4" />
            <span className="text-sm">Filters</span>
            {activeFiltersCount > 0 && (
              <span className="bg-purple-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>

        {/* Results Count */}
        <div className="text-sm text-purple-400">
          {filteredAndSortedContacts.length} of {contacts.length} contacts
        </div>
      </div>

      {/* Advanced Filters */}
      {showFilters && (
        <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-white font-medium">Advanced Filters</h4>
            {activeFiltersCount > 0 && (
              <button
                onClick={clearFilters}
                className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
              >
                Clear All
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Trust Level Filter */}
            <div>
              <label className="block text-sm text-purple-200 mb-1">Trust Level</label>
              <select
                value={filters.trustLevel || ''}
                onChange={(e) => handleFilterChange('trustLevel', e.target.value)}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="" className="bg-purple-900">All Levels</option>
                <option value="family" className="bg-purple-900">👨‍👩‍👧‍👦 Family</option>
                <option value="trusted" className="bg-purple-900">🤝 Trusted</option>
                <option value="known" className="bg-purple-900">👋 Known</option>
                <option value="unverified" className="bg-purple-900">❓ Unverified</option>
              </select>
            </div>

            {/* Family Role Filter */}
            <div>
              <label className="block text-sm text-purple-200 mb-1">Family Role</label>
              <select
                value={filters.familyRole || ''}
                onChange={(e) => handleFilterChange('familyRole', e.target.value)}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="" className="bg-purple-900">All Roles</option>
                            <option value="adult" className="bg-purple-900">Adult</option>
            <option value="offspring" className="bg-purple-900">Offspring</option>
                <option value="guardian" className="bg-purple-900">Guardian</option>
                <option value="advisor" className="bg-purple-900">Advisor</option>
                <option value="friend" className="bg-purple-900">Friend</option>
              </select>
            </div>

            {/* Gift Wrap Support Filter */}
            <div>
              <label className="block text-sm text-purple-200 mb-1">Gift Wrap Support</label>
              <select
                value={filters.supportsGiftWrap === undefined ? '' : filters.supportsGiftWrap.toString()}
                onChange={(e) => handleFilterChange('supportsGiftWrap', e.target.value === '' ? undefined : e.target.value === 'true')}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="" className="bg-purple-900">All Contacts</option>
                <option value="true" className="bg-purple-900">🎁 Supports Gift Wrap</option>
                <option value="false" className="bg-purple-900">❌ No Gift Wrap</option>
              </select>
            </div>

            {/* Verification Status Filter */}
            <div>
              <label className="block text-sm text-purple-200 mb-1">Verification</label>
              <select
                value={filters.verified === undefined ? '' : filters.verified.toString()}
                onChange={(e) => handleFilterChange('verified', e.target.value === '' ? undefined : e.target.value === 'true')}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="" className="bg-purple-900">All Contacts</option>
                <option value="true" className="bg-purple-900">✓ Verified</option>
                <option value="false" className="bg-purple-900">⚠️ Unverified</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Contacts Grid */}
      {filteredAndSortedContacts.length === 0 ? (
        <div className="text-center py-12">
          <Users className="h-16 w-16 text-purple-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">
            {searchQuery ? 'No matching contacts' : 'No contacts found'}
          </h3>
          <p className="text-purple-200 mb-6">
            {searchQuery 
              ? 'Try adjusting your search terms or filters'
              : activeFiltersCount > 0
              ? 'Try clearing some filters to see more contacts'
              : 'Start building your encrypted contact network'
            }
          </p>
          {activeFiltersCount > 0 && (
            <button
              onClick={clearFilters}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
          {filteredAndSortedContacts.map((contact) => (
            <ContactCard
              key={contact.id}
              contact={contact}
              onEdit={onEditContact}
              onDelete={onDeleteContact}
              onViewDetails={onViewContactDetails}
              onSelect={onContactSelect}
              showPrivateData={showPrivateData}
              loading={loading}
              selectionMode={selectionMode}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ContactsList;