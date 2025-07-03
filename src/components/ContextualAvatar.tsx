import React from 'react';

interface ContextualAvatarProps {
  member: {
    id: string;
    username: string;
    avatar?: string;
    lightningAddress?: string;
  };
  context: 'financial' | 'contacts';
  onFinancialClick?: (memberId: string) => void;
  onContactsClick?: (memberId: string) => void;
  size?: 'sm' | 'md' | 'lg';
}

export const ContextualAvatar: React.FC<ContextualAvatarProps> = ({
  member,
  context,
  onFinancialClick,
  onContactsClick,
  size = 'md'
}) => {
  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-12 h-12 text-lg'
  };

  const handleClick = () => {
    if (context === 'financial' && onFinancialClick) {
      onFinancialClick(member.id);
    } else if (context === 'contacts' && onContactsClick) {
      onContactsClick(member.id);
    }
  };

  const getTooltipText = () => {
    switch (context) {
      case 'financial':
        return `💰 Send Zap to ${member.username}`;
      case 'contacts':
        return `💬 Message ${member.username}`;
      default:
        return member.username;
    }
  };

  const getHoverColor = () => {
    switch (context) {
      case 'financial':
        return 'hover:bg-orange-600';
      case 'contacts':
        return 'hover:bg-blue-600';
      default:
        return 'hover:bg-gray-600';
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`${sizeClasses[size]} bg-orange-500 ${getHoverColor()} rounded-full flex items-center justify-center text-white font-semibold transition-all duration-200 hover:scale-110 cursor-pointer group relative`}
      title={getTooltipText()}
    >
      {member.avatar || member.username.charAt(0).toUpperCase()}
      
      {/* Hover tooltip */}
      <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
        {context === 'financial' ? '💰 Send Zap' : '💬 Message'}
      </div>
    </button>
  );
};

export default ContextualAvatar;