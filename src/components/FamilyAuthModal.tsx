// Family Federation Authentication Modal
// File: src/components/FamilyAuthModal.tsx
// Modal wrapper for seamless authentication integration

import React, { useState } from 'react';
import { FamilyFederationUser } from '../types/auth';
import FamilyFederationAuth from './FamilyFederationAuth';

interface FamilyAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (user: FamilyFederationUser) => void;
  title?: string;
  description?: string;
}

const FamilyAuthModal: React.FC<FamilyAuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  title = "Family Federation Access Required",
  description = "Please authenticate to access Family Financials"
}) => {
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 150);
  };

  const handleSuccess = (user: FamilyFederationUser) => {
    if (onSuccess) {
      onSuccess(user);
    }
    handleClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className={`fixed inset-0 bg-black transition-opacity duration-300 z-[9999] backdrop-blur-sm ${
        isClosing ? 'bg-opacity-0' : 'bg-opacity-50'
      }`}
      onClick={handleBackdropClick}
    >
      <div className="flex items-center justify-center min-h-screen p-4">
        <div 
          className={`transform transition-all duration-300 min-w-0 sm:min-w-[400px] min-h-[400px] max-w-2xl w-full ${
            isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
          }`}
        >
          <FamilyFederationAuth
            mode="modal"
            onClose={handleClose}
            onSuccess={handleSuccess}
          />
        </div>
      </div>
    </div>
  );
};

export default FamilyAuthModal;