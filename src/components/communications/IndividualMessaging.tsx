import { useState } from 'react';
import { FamilyNostrFederation } from '../fedimint/FamilyNostrFederation';
import { ContactsManager } from './ContactsManager';
import { GiftwrappedMessaging } from './GiftwrappedMessaging';
import { PeerInvitationModal } from './PeerInvitationModal';

// Enhanced privacy level enum
enum PrivacyLevel {
  MAXIMUM = 'giftwrapped',     // Complete metadata protection
  SELECTIVE = 'encrypted',     // Encrypted with controlled metadata
  TRANSPARENT = 'minimal'      // Standard encryption for public interactions
}

interface IndividualMessagingProps {
  individualMember: {
    id: string;
    username: string;
  };
  contacts?: any[]; // Legacy prop for backwards compatibility
}

export function IndividualMessaging({ individualMember, contacts: legacyContacts }: IndividualMessagingProps) {
  const [activeConversation, setActiveConversation] = useState(null);
  const [peerInvitations, setPeerInvitations] = useState([]);
  const [directMessages, setDirectMessages] = useState([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showContactsManager, setShowContactsManager] = useState(false);
  
  const federation = new FamilyNostrFederation();
  const sendPeerInvitation = async (recipientNpub, invitationType, personalMessage, privacyLevel = PrivacyLevel.MAXIMUM) => {
    try {
      const invitationEvent = {
        kind: privacyLevel === PrivacyLevel.MAXIMUM ? 14 : privacyLevel === PrivacyLevel.SELECTIVE ? 4 : 1, // Gift Wrapped DM, Encrypted DM, or Public Note
        content: JSON.stringify({
          type: 'peer-invitation',
          invitationType: invitationType, // 'friend', 'business', 'family-associate'
          privacyLevel: privacyLevel,
          senderProfile: {
            username: individualMember.username,
            lightningAddress: `${individualMember.username}@satnam.pub`,
            nip05: `${individualMember.username}@satnam.pub`
          },
          message: personalMessage || `${individualMember.username} would like to connect with you on Satnam.pub`
        }),
        tags: [
          ['p', recipientNpub],
          ['invitation-type', invitationType],
          ['privacy-level', privacyLevel],
          ['satnam-peer-invite', 'true']
        ]
      };
      const result = await federation.requestGuardianApprovalForSigning(
        invitationEvent, 
        individualMember.id
      );
      if (result.success) {
        setPeerInvitations(prev => [...prev, {
          id: Date.now(),
          recipient: recipientNpub,
          type: invitationType,
          status: 'sent',
          timestamp: new Date()
        }]);
      }
    } catch (error) {
      console.error('Failed to send peer invitation:', error);
    }
  };
  return (
    <div className="individual-messaging-container">
      <div className="flex h-96">
        {/* Contact List */}
        <div className="w-1/3 border-r border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Contacts</h3>
            <button
              onClick={() => setShowContactsManager(true)}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              Manage
            </button>
          </div>
          
          {/* Legacy contacts support */}
          <div className="space-y-2">
            {(legacyContacts || []).map(contact => (
              <div 
                key={contact.npub}
                onClick={() => setActiveConversation(contact)}
                className="p-3 rounded-lg cursor-pointer hover:bg-gray-50"
              >
                <div className="font-medium text-sm">{contact.username}</div>
                <div className="text-xs text-gray-500">{contact.nip05}</div>
              </div>
            ))}
          </div>
          
          {/* Enhanced Contact Management */}
          <div className="mt-4 space-y-2">
            <button 
              onClick={() => setShowContactsManager(true)}
              className="w-full bg-purple-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-purple-700"
            >
              📱 Contact Manager
            </button>
            
            <button 
              onClick={() => setShowInviteModal(true)}
              className="w-full bg-blue-500 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-600"
            >
              Invite New Contact
            </button>
          </div>
        </div>
        {/* Message Area */}
        <div className="flex-1 p-4">
          {activeConversation ? (
            <GiftwrappedMessaging 
              familyMember={individualMember}
              recipient={activeConversation}
              conversationType="individual"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              Select a contact to start messaging
            </div>
          )}
        </div>
      </div>
      {/* Peer Invitation Modal */}
      <PeerInvitationModal 
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        onSendInvitation={sendPeerInvitation}
        senderProfile={individualMember}
      />

      {/* Enhanced Contacts Manager Modal */}
      {showContactsManager && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Contact Manager</h2>
              <button
                onClick={() => setShowContactsManager(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="text-2xl">×</span>
              </button>
            </div>
            <div className="p-6 max-h-[80vh] overflow-y-auto">
              <ContactsManager
                onSelectContact={(contact) => {
                  setActiveConversation(contact);
                  setShowContactsManager(false);
                }}
                selectedContactId={activeConversation?.id}
                showAddButton={true}
                compact={false}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}