import React, { useState, useEffect } from 'react';
import { Search, User, Users, X } from 'lucide-react';

interface Contact {
  id: string;
  name: string;
  npub?: string;
  lightningAddress?: string;
  avatar?: string;
  role?: 'family' | 'friend' | 'business' | 'guardian';
  isOnline?: boolean;
}

interface ContactsSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectContact: (contact: Contact) => void;
  title?: string;
  showFamilyOnly?: boolean;
  showOnlineOnly?: boolean;
}

const ContactsSelector: React.FC<ContactsSelectorProps> = ({
  isOpen,
  onClose,
  onSelectContact,
  title = "Select Contact",
  showFamilyOnly = false,
  showOnlineOnly = false
}) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // Mock contacts data - replace with actual API call
  useEffect(() => {
    const loadContacts = async () => {
      try {
        // This would be replaced with actual API call
        const mockContacts: Contact[] = [
          {
            id: '1',
            name: 'Alice Johnson',
            npub: 'npub1alice123...',
            lightningAddress: 'alice@lightning.com',
            role: 'family',
            isOnline: true
          },
          {
            id: '2',
            name: 'Bob Smith',
            npub: 'npub1bob456...',
            lightningAddress: 'bob@lightning.com',
            role: 'friend',
            isOnline: false
          },
          {
            id: '3',
            name: 'Carol Davis',
            npub: 'npub1carol789...',
            lightningAddress: 'carol@lightning.com',
            role: 'family',
            isOnline: true
          },
          {
            id: '4',
            name: 'David Wilson',
            npub: 'npub1david012...',
            lightningAddress: 'david@lightning.com',
            role: 'business',
            isOnline: true
          }
        ];

        let filtered = mockContacts;
        
        if (showFamilyOnly) {
          filtered = filtered.filter(contact => contact.role === 'family');
        }
        
        if (showOnlineOnly) {
          filtered = filtered.filter(contact => contact.isOnline);
        }

        setContacts(filtered);
        setFilteredContacts(filtered);
      } catch (error) {
        console.error('Failed to load contacts:', error);
      } finally {
        setLoading(false);
      }
    };

    if (isOpen) {
      loadContacts();
    }
  }, [isOpen, showFamilyOnly, showOnlineOnly]);

  useEffect(() => {
    const filtered = contacts.filter(contact =>
      contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.lightningAddress?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.npub?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredContacts(filtered);
  }, [searchTerm, contacts]);

  const handleContactSelect = (contact: Contact) => {
    onSelectContact(contact);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4 max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <input
            type="text"
            placeholder="Search contacts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
        </div>

        {/* Contacts List */}
        <div className="overflow-y-auto max-h-96">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500"></div>
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Users className="h-12 w-12 mx-auto mb-2 text-gray-300" />
              <p>No contacts found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredContacts.map((contact) => (
                <button
                  key={contact.id}
                  onClick={() => handleContactSelect(contact)}
                  className="w-full p-3 text-left border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-orange-300 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="relative">
                      <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center text-white font-medium">
                        {contact.name.charAt(0)}
                      </div>
                      {contact.isOnline && (
                        <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <p className="font-medium text-gray-900 truncate">{contact.name}</p>
                        {contact.role && (
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            contact.role === 'family' ? 'bg-blue-100 text-blue-700' :
                            contact.role === 'friend' ? 'bg-green-100 text-green-700' :
                            contact.role === 'business' ? 'bg-purple-100 text-purple-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {contact.role}
                          </span>
                        )}
                      </div>
                      {contact.lightningAddress && (
                        <p className="text-sm text-gray-500 truncate">{contact.lightningAddress}</p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex space-x-2">
            <button
              onClick={() => handleContactSelect({
                id: 'new',
                name: 'New Contact',
                lightningAddress: '',
                role: 'friend'
              })}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Add New Contact
            </button>
            <button
              onClick={() => handleContactSelect({
                id: 'manual',
                name: 'Manual Entry',
                lightningAddress: '',
                role: 'friend'
              })}
              className="px-4 py-2 border border-orange-500 text-orange-500 hover:bg-orange-50 rounded-lg transition-colors"
            >
              Manual
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContactsSelector; 