/**
 * EditContactForm Component
 * 
 * Form for editing existing contacts in the Privacy-First Contacts system.
 * Compatible with Bolt.new and Netlify serverless deployments.
 */

import { AlertTriangle, Edit3, Save, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Contact, UpdateContactInput } from '../types/contacts';

interface EditContactFormProps {
  contact: Contact;
  onSubmit: (contactData: UpdateContactInput) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  error?: string | null;
}

interface FormState {
  displayName: string;
  nip05: string;
  familyRole: Contact['familyRole'];
  trustLevel: Contact['trustLevel'];
  preferredEncryption: Contact['preferredEncryption'];
  notes: string;
  tags: string[];
}

interface FormErrors {
  displayName?: string;
  nip05?: string;
  tags?: string;
}

export const EditContactForm: React.FC<EditContactFormProps> = ({
  contact,
  onSubmit,
  onCancel,
  loading = false,
  error = null,
}) => {
  const [formData, setFormData] = useState<FormState>({
    displayName: contact.displayName,
    nip05: contact.nip05 || '',
    familyRole: contact.familyRole || 'friend',
    trustLevel: contact.trustLevel,
    preferredEncryption: contact.preferredEncryption,
    notes: contact.notes || '',
    tags: [...contact.tags],
  });

  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [tagInput, setTagInput] = useState<string>('');
  const [hasChanges, setHasChanges] = useState<boolean>(false);

  // Track changes
  useEffect(() => {
    const hasFormChanges = 
      formData.displayName !== contact.displayName ||
      formData.nip05 !== (contact.nip05 || '') ||
      formData.familyRole !== (contact.familyRole || 'friend') ||
      formData.trustLevel !== contact.trustLevel ||
      formData.preferredEncryption !== contact.preferredEncryption ||
      formData.notes !== (contact.notes || '') ||
      JSON.stringify(formData.tags.sort()) !== JSON.stringify([...contact.tags].sort());
    
    setHasChanges(hasFormChanges);
  }, [formData, contact]);

  // Validation functions
  const validateDisplayName = (displayName: string): string | undefined => {
    if (!displayName.trim()) {
      return 'Display name is required';
    }
    if (displayName.length > 100) {
      return 'Display name must be less than 100 characters';
    }
    return undefined;
  };

  const validateNip05 = (nip05: string): string | undefined => {
    if (!nip05.trim()) return undefined; // Optional field

    // Basic email-like format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(nip05)) {
      return 'NIP-05 must be in format: username@domain.com';
    }
    return undefined;
  };

  const validateTags = (tags: string[]): string | undefined => {
    if (tags.length > 10) {
      return 'Maximum 10 tags allowed';
    }
    const invalidTag = tags.find(tag => tag.length > 50);
    if (invalidTag) {
      return 'Each tag must be less than 50 characters';
    }
    return undefined;
  };

  // Form handlers
  const handleInputChange = (field: keyof FormState, value: string): void => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error for this field when user starts typing
    if (formErrors[field as keyof FormErrors]) {
      setFormErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSelectChange = (field: keyof FormState, value: any): void => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddTag = (): void => {
    const tag = tagInput.trim();
    if (tag && !formData.tags.includes(tag) && formData.tags.length < 10) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tag]
      }));
      setTagInput('');
      
      // Clear tag error
      if (formErrors.tags) {
        setFormErrors(prev => ({ ...prev, tags: undefined }));
      }
    }
  };

  const handleRemoveTag = (tagToRemove: string): void => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleTagInputKeyPress = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const validateForm = (): boolean => {
    const errors: FormErrors = {};

    const displayNameError = validateDisplayName(formData.displayName);
    if (displayNameError) errors.displayName = displayNameError;

    const nip05Error = validateNip05(formData.nip05);
    if (nip05Error) errors.nip05 = nip05Error;

    const tagsError = validateTags(formData.tags);
    if (tagsError) errors.tags = tagsError;

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    if (!hasChanges) {
      onCancel();
      return;
    }

    const updateData: UpdateContactInput = {
      id: contact.id,
      displayName: formData.displayName.trim(),
      nip05: formData.nip05.trim() || undefined,
      familyRole: formData.familyRole,
      trustLevel: formData.trustLevel,
      preferredEncryption: formData.preferredEncryption,
      notes: formData.notes.trim() || undefined,
      tags: formData.tags,
    };

    try {
      await onSubmit(updateData);
    } catch (err) {
      // Error handled by parent component
      console.error('Form submission error:', err);
    }
  };

  const isFormValid = (): boolean => {
    return formData.displayName.trim() !== '' && 
           Object.keys(formErrors).length === 0;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4 mb-6">
        <button
          onClick={onCancel}
          disabled={loading}
          className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all duration-300 disabled:opacity-50"
        >
          <X className="h-5 w-5 text-white" />
        </button>
        <div className="flex-1">
          <h3 className="text-xl font-bold text-white">Edit Contact</h3>
          <p className="text-purple-200 text-sm">
            Editing: {contact.displayName}
          </p>
        </div>
        {hasChanges && (
          <div className="text-yellow-400 text-sm font-medium">
            • Unsaved changes
          </div>
        )}
      </div>

      {/* Privacy Notice */}
      <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg p-4">
        <div className="flex items-start space-x-2">
          <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
            <Edit3 className="h-3 w-3 text-white" />
          </div>
          <div>
            <p className="text-blue-400 font-medium text-sm">Editing Encrypted Contact</p>
            <p className="text-blue-300 text-sm mt-1">
              Changes will be encrypted and updated securely. NPub cannot be modified for security reasons.
            </p>
          </div>
        </div>
      </div>

      {/* Read-only NPub Display */}
      <div>
        <label className="block text-sm font-medium text-purple-200 mb-2">
          NPub (Public Key) - Read Only
        </label>
        <div className="w-full px-4 py-3 bg-gray-500/20 border border-gray-500/30 rounded-lg text-gray-400 font-mono text-sm">
          {contact.npub}
        </div>
        <p className="text-purple-300 text-xs mt-1">
          NPub cannot be changed for security reasons. Create a new contact if needed.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Display Name */}
        <div>
          <label className="block text-sm font-medium text-purple-200 mb-2">
            Display Name *
          </label>
          <input
            type="text"
            placeholder="John Doe"
            value={formData.displayName}
            onChange={(e) => handleInputChange('displayName', e.target.value)}
            disabled={loading}
            className={`w-full px-4 py-3 bg-white/10 border rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 ${
              formErrors.displayName ? 'border-red-500/50' : 'border-white/20'
            }`}
          />
          {formErrors.displayName && (
            <p className="text-red-400 text-sm mt-1">{formErrors.displayName}</p>
          )}
        </div>

        {/* NIP-05 */}
        <div>
          <label className="block text-sm font-medium text-purple-200 mb-2">
            NIP-05 Identifier (Optional)
          </label>
          <input
            type="text"
            placeholder="user@domain.com"
            value={formData.nip05}
            onChange={(e) => handleInputChange('nip05', e.target.value)}
            disabled={loading}
            className={`w-full px-4 py-3 bg-white/10 border rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 ${
              formErrors.nip05 ? 'border-red-500/50' : 'border-white/20'
            }`}
          />
          {formErrors.nip05 && (
            <p className="text-red-400 text-sm mt-1">{formErrors.nip05}</p>
          )}
        </div>

        {/* Trust Level and Family Role */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-purple-200 mb-2">
              Trust Level
            </label>
            <select
              value={formData.trustLevel}
              onChange={(e) => handleSelectChange('trustLevel', e.target.value as Contact['trustLevel'])}
              disabled={loading}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
            >
              <option value="family" className="bg-purple-900">👨‍👩‍👧‍👦 Family</option>
              <option value="trusted" className="bg-purple-900">🤝 Trusted</option>
              <option value="known" className="bg-purple-900">👋 Known</option>
              <option value="unverified" className="bg-purple-900">❓ Unverified</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-purple-200 mb-2">
              Family Role
            </label>
            <select
              value={formData.familyRole}
              onChange={(e) => handleSelectChange('familyRole', e.target.value as Contact['familyRole'])}
              disabled={loading}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
            >
                          <option value="adult" className="bg-purple-900">Adult</option>
            <option value="offspring" className="bg-purple-900">Offspring</option>
              <option value="guardian" className="bg-purple-900">Guardian</option>
              <option value="advisor" className="bg-purple-900">Advisor</option>
              <option value="friend" className="bg-purple-900">Friend</option>
            </select>
          </div>
        </div>

        {/* Encryption Preference */}
        <div>
          <label className="block text-sm font-medium text-purple-200 mb-2">
            Preferred Encryption
          </label>
          <select
            value={formData.preferredEncryption}
            onChange={(e) => handleSelectChange('preferredEncryption', e.target.value as Contact['preferredEncryption'])}
            disabled={loading}
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
          >
            <option value="auto" className="bg-purple-900">🔄 Auto-detect</option>
            <option value="gift-wrap" className="bg-purple-900">🎁 Gift Wrap (Preferred)</option>
            <option value="nip04" className="bg-purple-900">🔐 NIP-04</option>
          </select>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-purple-200 mb-2">
            Tags (Optional)
          </label>
          <div className="space-y-2">
            <div className="flex space-x-2">
              <input
                type="text"
                placeholder="Add a tag..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={handleTagInputKeyPress}
                disabled={loading || formData.tags.length >= 10}
                className="flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm disabled:opacity-50"
              />
              <button
                type="button"
                onClick={handleAddTag}
                disabled={!tagInput.trim() || loading || formData.tags.length >= 10}
                className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
            
            {/* Tags Display */}
            {formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.tags.map((tag, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-2 py-1 bg-purple-500/20 text-purple-300 rounded-full text-sm border border-purple-500/30"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      disabled={loading}
                      className="ml-1 text-purple-400 hover:text-purple-200 transition-colors disabled:opacity-50"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            
            {formErrors.tags && (
              <p className="text-red-400 text-sm">{formErrors.tags}</p>
            )}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-purple-200 mb-2">
            Notes (Optional)
          </label>
          <textarea
            placeholder="Add notes about this contact..."
            value={formData.notes}
            onChange={(e) => handleInputChange('notes', e.target.value)}
            disabled={loading}
            rows={3}
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none disabled:opacity-50"
          />
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-red-500/20 border border-red-500/30 rounded-lg">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <span className="text-red-400 font-medium">Error</span>
            </div>
            <p className="text-red-300 text-sm mt-1">{error}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4 pt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-6 py-3 bg-white/10 border border-white/20 hover:bg-white/20 text-white font-medium rounded-lg transition-all duration-300 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isFormValid() || !hasChanges || loading}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-500 disabled:to-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Save className="h-5 w-5" />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default EditContactForm;