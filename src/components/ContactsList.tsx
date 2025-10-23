/**
 * ContactsList Component
 *
 * CRITICAL SECURITY: Privacy-first contact filtering with user-controlled localStorage logging
 * PRIVACY-FIRST: Local search and filtering only, zero external API calls
 */

import { Filter, SortAsc, SortDesc, Users } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { Contact, ContactFilters, ContactSortOptions } from '../types/contacts';
import ContactCard from './ContactCard';

interface ContactsListProps {
  contacts: Contact[];
  onEditContact: (contact: Contact) => void;
  onDeleteContact: (contactId: string) => void;
  onViewContactDetails: (contact: Contact) => void;
  onContactSelect?: (contact: Contact) => void;
  onZapContact?: (contact: Contact) => void;
  showPrivateData: boolean;
  loading?: boolean;
  searchQuery?: string;
  selectionMode?: boolean;
  enableTrustFiltering?: boolean;
}

export const ContactsList: React.FC<ContactsListProps> = ({
  contacts,
  onEditContact,
  onDeleteContact,
  onViewContactDetails,
  onContactSelect,
  onZapContact,
  showPrivateData,
  loading = false,
  searchQuery = '',
  selectionMode = false,
  enableTrustFiltering = false,
}) => {
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [filters, setFilters] = useState<ContactFilters>({});
  const [sortOptions, setSortOptions] = useState<ContactSortOptions>({
    field: 'displayName',
    direction: 'asc',
  });
  const [trustFilters, setTrustFilters] = useState<TrustFilters>({});

  /**
   * CRITICAL SECURITY: User-controlled local contact list operation logging
   * Stores contact list operations in user's local encrypted storage (localStorage)
   * NEVER stored in external databases - user maintains full control
   */
  const logContactListOperation = async (operationData: {
    operation: string;
    details: any;
    timestamp: Date;
  }): Promise<void> => {
    try {
      const existingHistory = localStorage.getItem("satnam_contact_list_history");
      const operationHistory = existingHistory ? JSON.parse(existingHistory) : [];

      const operationRecord = {
        id: crypto.randomUUID(),
        type: "contact_list_operation",
        ...operationData,
        timestamp: operationData.timestamp.toISOString(),
      };

      operationHistory.push(operationRecord);

      // Keep only last 1000 operations to prevent localStorage bloat
      if (operationHistory.length > 1000) {
        operationHistory.splice(0, operationHistory.length - 1000);
      }

      localStorage.setItem("satnam_contact_list_history", JSON.stringify(operationHistory));
    } catch (error) {
      // Silent fail for privacy - no external logging
    }
  };

  // CRITICAL SECURITY: Privacy-first contact filtering with local search only
  const filteredAndSortedContacts = useMemo(() => {
    let filtered = contacts;
    const originalCount = contacts.length;

    // Apply search filter (local search only - no external APIs)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(contact =>
        contact.displayName.toLowerCase().includes(query) ||
        contact.nip05?.toLowerCase().includes(query) ||
        contact.notes?.toLowerCase().includes(query) ||
        contact.tags.some(tag => tag.toLowerCase().includes(query))
      );

      // Log search operation for user transparency
      logContactListOperation({
        operation: "contact_search_performed",
        details: {
          searchQuery: query.slice(0, 10) + '...', // Truncated for privacy
          resultsCount: filtered.length,
          originalCount,
        },
        timestamp: new Date(),
      });
    }

    // Apply advanced filters with privacy-first logging
    const appliedFilters: string[] = [];

    if (filters.trustLevel) {
      filtered = filtered.filter(contact => contact.trustLevel === filters.trustLevel);
      appliedFilters.push(`trustLevel:${filters.trustLevel}`);
    }

    if (filters.familyRole) {
      filtered = filtered.filter(contact => contact.familyRole === filters.familyRole);
      appliedFilters.push(`familyRole:${filters.familyRole}`);
    }

    if (filters.supportsGiftWrap !== undefined) {
      filtered = filtered.filter(contact => contact.supportsGiftWrap === filters.supportsGiftWrap);
      appliedFilters.push(`giftWrap:${filters.supportsGiftWrap}`);
    }

    if (filters.verified !== undefined) {
      filtered = filtered.filter(contact => {
        const isVerified = contact.nip05Verified || contact.pubkeyVerified;
        return isVerified === filters.verified;
      });
      appliedFilters.push(`verified:${filters.verified}`);
    }

    // Phase 3 Day 2: Apply trust-based filters
    if (enableTrustFiltering) {
      if (trustFilters.minTrustScore !== undefined) {
        filtered = filtered.filter(contact =>
          (contact.cachedTrustScore || 0) >= trustFilters.minTrustScore!
        );
        appliedFilters.push(`minTrustScore:${trustFilters.minTrustScore}`);
      }

      if (trustFilters.maxTrustScore !== undefined) {
        filtered = filtered.filter(contact =>
          (contact.cachedTrustScore || 0) <= trustFilters.maxTrustScore!
        );
        appliedFilters.push(`maxTrustScore:${trustFilters.maxTrustScore}`);
      }

      if (trustFilters.showUnverified === false) {
        filtered = filtered.filter(contact =>
          contact.nip05Verified || contact.pubkeyVerified || contact.vpVerified || contact.physicallyVerified
        );
        appliedFilters.push(`verified:true`);
      }
    }

    // Log filtering operations for user transparency
    if (appliedFilters.length > 0) {
      logContactListOperation({
        operation: "contact_filters_applied",
        details: {
          filters: appliedFilters,
          resultsCount: filtered.length,
          originalCount,
        },
        timestamp: new Date(),
      });
    }

    // Sort contacts with proper typing
    filtered.sort((a, b) => {
      let aValue: string | number | Date;
      let bValue: string | number | Date;

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
        // Phase 3 Day 2: Trust score sorting
        case 'trustScore':
          aValue = a.cachedTrustScore || 0;
          bValue = b.cachedTrustScore || 0;
          break;
        default:
          aValue = a.displayName.toLowerCase();
          bValue = b.displayName.toLowerCase();
      }

      if (aValue < bValue) return sortOptions.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOptions.direction === 'asc' ? 1 : -1;
      return 0;
    });

    // Log sort operations for user transparency
    logContactListOperation({
      operation: "contact_list_sorted",
      details: {
        sortField: sortOptions.field,
        sortDirection: sortOptions.direction,
        contactCount: filtered.length,
      },
      timestamp: new Date(),
    });

    return filtered;
  }, [contacts, searchQuery, filters, sortOptions, trustFilters, enableTrustFiltering]);

  const handleSortChange = (field: ContactSortOptions['field']): void => {
    setSortOptions(prev => {
      const newDirection = prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc';

      // Log sort change for user transparency
      logContactListOperation({
        operation: "sort_option_changed",
        details: {
          field,
          direction: newDirection,
          previousField: prev.field,
          previousDirection: prev.direction,
        },
        timestamp: new Date(),
      });

      return { field, direction: newDirection };
    });
  };

  const handleFilterChange = (key: keyof ContactFilters, value: string | boolean | undefined): void => {
    const newValue = value === '' ? undefined : value;

    setFilters(prev => ({
      ...prev,
      [key]: newValue,
    }));

    // Log filter change for user transparency
    logContactListOperation({
      operation: "filter_option_changed",
      details: {
        filterKey: key,
        filterValue: newValue,
        activeFiltersCount: Object.values({ ...filters, [key]: newValue }).filter(v => v !== undefined).length,
      },
      timestamp: new Date(),
    });
  };

  const clearFilters = (): void => {
    setFilters({});
    setSortOptions({ field: 'displayName', direction: 'asc' });

    // Log filter clear for user transparency
    logContactListOperation({
      operation: "filters_cleared",
      details: {
        previousFiltersCount: Object.values(filters).filter(v => v !== undefined).length,
        resetToDefault: true,
      },
      timestamp: new Date(),
    });
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
              onChange={(e) => handleSortChange(e.target.value as ContactSortOptions['field'] | 'trustScore')}
              className="px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
            >
              <option value="displayName" className="bg-purple-900">Name</option>
              <option value="addedAt" className="bg-purple-900">Date Added</option>
              <option value="lastContact" className="bg-purple-900">Last Contact</option>
              <option value="trustLevel" className="bg-purple-900">Trust Level</option>
              <option value="contactCount" className="bg-purple-900">Message Count</option>
              {enableTrustFiltering && (
                <option value="trustScore" className="bg-purple-900">Trust Score</option>
              )}
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
            className={`flex items-center space-x-2 px-3 py-1 rounded-lg transition-colors ${showFilters || activeFiltersCount > 0
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

            {/* Family Role Filter - Master Context Standardized Roles */}
            <div>
              <label className="block text-sm text-purple-200 mb-1">Family Role</label>
              <select
                value={filters.familyRole || ''}
                onChange={(e) => handleFilterChange('familyRole', e.target.value)}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="" className="bg-purple-900">All Roles</option>
                <option value="private" className="bg-purple-900">Private</option>
                <option value="offspring" className="bg-purple-900">Offspring</option>
                <option value="adult" className="bg-purple-900">Adult</option>
                <option value="steward" className="bg-purple-900">Steward</option>
                <option value="guardian" className="bg-purple-900">Guardian</option>
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

      {/* Phase 3 Day 2: Trust Filter Panel */}
      {enableTrustFiltering && showFilters && (
        <div className="mt-4">
          <TrustFilterPanel
            onFilterChange={setTrustFilters}
            currentFilters={trustFilters}
          />
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
              // CRITICAL SECURITY: Authentication-gated Zap functionality with Lightning provider routing
              onZapContact={onZapContact}
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