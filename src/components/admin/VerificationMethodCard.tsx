/**
 * Verification Method Card Component
 * Phase 2B-2 Week 2 Task 3 Day 2: Admin Dashboard Integration
 * 
 * Reusable card component for verification method selection grid
 * Used in HierarchicalAdminDashboard "Verification Methods" tab
 */

import React from 'react';

interface VerificationMethodCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
  isActive?: boolean;
  isDisabled?: boolean;
  className?: string;
}

const VerificationMethodCard: React.FC<VerificationMethodCardProps> = ({
  title,
  description,
  icon,
  onClick,
  isActive = false,
  isDisabled = false,
  className = '',
}) => {
  return (
    <div
      onClick={isDisabled ? undefined : onClick}
      className={`
        bg-white rounded-lg shadow-md p-6
        border-2 transition-all
        ${isActive ? 'border-purple-600 bg-purple-50' : 'border-gray-200 hover:border-purple-400'}
        ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-lg'}
        ${className}
      `}
    >
      <div className="flex items-center space-x-3 mb-3">
        <div className={`${isActive ? 'text-purple-600' : 'text-gray-600'}`}>
          {icon}
        </div>
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      </div>
      <p className="text-sm text-gray-600">{description}</p>
      {isDisabled && (
        <div className="mt-3">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
            Coming Soon
          </span>
        </div>
      )}
    </div>
  );
};

export default VerificationMethodCard;

