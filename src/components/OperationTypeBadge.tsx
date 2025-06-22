import React from 'react';

export type OperationType = 'identity' | 'payment' | 'general';

interface OperationTypeBadgeProps {
  type: OperationType;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const OperationTypeBadge: React.FC<OperationTypeBadgeProps> = ({ 
  type, 
  size = 'md',
  className = '' 
}) => {
  const getTypeConfig = (operationType: OperationType) => {
    switch (operationType) {
      case 'identity':
        return {
          icon: '🆔',
          label: 'Identity',
          bgColor: 'bg-purple-800',
          textColor: 'text-purple-200',
          description: 'Nostr identity operations'
        };
      case 'payment':
        return {
          icon: '⚡',
          label: 'Payment',
          bgColor: 'bg-orange-800',
          textColor: 'text-orange-200',
          description: 'Lightning payment operations'
        };
      case 'general':
        return {
          icon: '⚙️',
          label: 'General',
          bgColor: 'bg-gray-800',
          textColor: 'text-gray-200',
          description: 'General operations'
        };
    }
  };

  const getSizeClasses = (badgeSize: string) => {
    switch (badgeSize) {
      case 'sm':
        return 'px-2 py-1 text-xs';
      case 'lg':
        return 'px-4 py-2 text-base';
      default:
        return 'px-3 py-1 text-sm';
    }
  };

  const config = getTypeConfig(type);
  const sizeClasses = getSizeClasses(size);

  return (
    <div 
      className={`${config.bgColor} ${config.textColor} ${sizeClasses} rounded-full font-medium flex items-center space-x-1 ${className}`}
      title={config.description}
    >
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </div>
  );
};

export default OperationTypeBadge;