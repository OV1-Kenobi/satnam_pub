/**
 * TrustProviderCard Component
 * Phase 3 Day 1: Trust Provider Discovery & Marketplace UI
 *
 * Component for displaying individual trust provider cards
 * Shows provider details, ratings, and subscription actions
 *
 * Maintains zero-knowledge architecture and privacy-first principles
 */

import React from "react";
import { Star, Users, ExternalLink, Plus, Check } from "lucide-react";
import type { Provider } from "../../lib/trust/types";

interface TrustProviderCardProps {
  provider: Provider;
  isSubscribed?: boolean;
  onSubscribe?: (providerId: string) => void;
  onUnsubscribe?: (providerId: string) => void;
  onViewDetails?: (providerId: string) => void;
}

export const TrustProviderCard: React.FC<TrustProviderCardProps> = ({
  provider,
  isSubscribed = false,
  onSubscribe,
  onUnsubscribe,
  onViewDetails,
}) => {
  const handleSubscribeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSubscribed) {
      onUnsubscribe?.(provider.id);
    } else {
      onSubscribe?.(provider.id);
    }
  };

  const handleDetailsClick = () => {
    onViewDetails?.(provider.id);
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`w-4 h-4 ${
              star <= Math.round(rating)
                ? "fill-yellow-400 text-yellow-400"
                : "text-gray-300"
            }`}
          />
        ))}
        <span className="text-sm text-gray-600 ml-1">
          {rating.toFixed(1)}
        </span>
      </div>
    );
  };

  return (
    <div
      onClick={handleDetailsClick}
      className="bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer overflow-hidden"
    >
      {/* Header with icon and verified badge */}
      <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            {provider.iconUrl ? (
              <img
                src={provider.iconUrl}
                alt={provider.name}
                className="w-12 h-12 rounded-lg bg-white border border-gray-200"
              />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-white border border-gray-200 flex items-center justify-center">
                <span className="text-lg font-semibold text-gray-400">
                  {provider.name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-900">{provider.name}</h3>
                {provider.isVerified && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                    <Check className="w-3 h-3" />
                    Verified
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-600 mt-1">{provider.category}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="p-4 border-b border-gray-200">
        <p className="text-sm text-gray-700 line-clamp-2">
          {provider.description}
        </p>
      </div>

      {/* Stats */}
      <div className="p-4 bg-gray-50 border-b border-gray-200">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-gray-600 mb-1">Rating</div>
            {renderStars(provider.rating)}
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1">Users</div>
            <div className="flex items-center gap-1 text-sm font-medium text-gray-900">
              <Users className="w-4 h-4 text-gray-500" />
              {provider.userCount.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 flex gap-2">
        <button
          onClick={handleSubscribeClick}
          className={`flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2 ${
            isSubscribed
              ? "bg-green-100 text-green-700 hover:bg-green-200"
              : "bg-blue-100 text-blue-700 hover:bg-blue-200"
          }`}
        >
          {isSubscribed ? (
            <>
              <Check className="w-4 h-4" />
              Subscribed
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              Subscribe
            </>
          )}
        </button>

        {provider.websiteUrl && (
          <a
            href={provider.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center"
            title="Visit provider website"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
  );
};

export default TrustProviderCard;

