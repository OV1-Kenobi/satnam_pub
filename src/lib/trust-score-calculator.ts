/**
 * Trust Score Calculator
 * Calculates user trust scores based on verification methods and attestations
 * Integrates SimpleProof (blockchain), Iroh (DHT), and existing verification methods
 * 
 * @compliance Privacy-first, zero-knowledge, no PII storage
 */

export interface TrustScoreBreakdown {
  baseScore: number;
  simpleproofPoints: number;
  irohPoints: number;
  accountAgePoints: number;
  multiMethodBonus: number;
  nip05Points: number;
  pkarrPoints: number;
  kind0Points: number;
  totalScore: number;
  verificationMethods: string[];
  lastUpdated: number;
}

export interface VerificationData {
  simpleproofTimestamp?: {
    verified: boolean;
    bitcoinBlock?: number;
    createdAt: number;
  };
  irohNodeDiscovery?: {
    isReachable: boolean;
    discoveredAt: number;
  };
  nip05Verified?: boolean;
  pkarrVerified?: boolean;
  kind0Verified?: boolean;
  accountCreatedAt?: number;
}

/**
 * Calculate trust score based on verification methods
 * 
 * Scoring breakdown:
 * - Base: 0 points
 * - SimpleProof (blockchain-anchored): +10 points
 * - Iroh (DHT discovery): +5 points
 * - Account age (OTS proof): +5 points
 * - NIP-05 (DNS): +5 points
 * - PKARR (decentralized): +5 points
 * - Kind:0 (Nostr metadata): +5 points
 * - Multi-method bonus (2+ methods): +10 points
 * - Multi-method bonus (3+ methods): +15 points
 * - Multi-method bonus (4+ methods): +20 points
 * 
 * Maximum possible: 75 points
 */
export function calculateTrustScore(data: VerificationData): TrustScoreBreakdown {
  let totalScore = 0;
  const verificationMethods: string[] = [];

  // SimpleProof verification (+10 points)
  let simpleproofPoints = 0;
  if (data.simpleproofTimestamp?.verified) {
    simpleproofPoints = 10;
    totalScore += simpleproofPoints;
    verificationMethods.push('SimpleProof');
  }

  // Iroh node discovery (+5 points)
  let irohPoints = 0;
  if (data.irohNodeDiscovery?.isReachable) {
    irohPoints = 5;
    totalScore += irohPoints;
    verificationMethods.push('Iroh');
  }

  // Account age verification via OTS proof (+5 points)
  let accountAgePoints = 0;
  if (data.accountCreatedAt && data.simpleproofTimestamp?.verified) {
    accountAgePoints = 5;
    totalScore += accountAgePoints;
    verificationMethods.push('Account Age');
  }

  // NIP-05 verification (+5 points)
  let nip05Points = 0;
  if (data.nip05Verified) {
    nip05Points = 5;
    totalScore += nip05Points;
    verificationMethods.push('NIP-05');
  }

  // PKARR verification (+5 points)
  let pkarrPoints = 0;
  if (data.pkarrVerified) {
    pkarrPoints = 5;
    totalScore += pkarrPoints;
    verificationMethods.push('PKARR');
  }

  // Kind:0 verification (+5 points)
  let kind0Points = 0;
  if (data.kind0Verified) {
    kind0Points = 5;
    totalScore += kind0Points;
    verificationMethods.push('Kind:0');
  }

  // Multi-method bonus
  let multiMethodBonus = 0;
  if (verificationMethods.length >= 4) {
    multiMethodBonus = 20;
  } else if (verificationMethods.length === 3) {
    multiMethodBonus = 15;
  } else if (verificationMethods.length === 2) {
    multiMethodBonus = 10;
  }
  totalScore += multiMethodBonus;

  // Cap at 100 points
  totalScore = Math.min(totalScore, 100);

  return {
    baseScore: 0,
    simpleproofPoints,
    irohPoints,
    accountAgePoints,
    multiMethodBonus,
    nip05Points,
    pkarrPoints,
    kind0Points,
    totalScore,
    verificationMethods,
    lastUpdated: Math.floor(Date.now() / 1000),
  };
}

/**
 * Get trust level badge based on score
 */
export function getTrustLevelBadge(score: number): {
  level: 'verified' | 'partial' | 'unverified';
  label: string;
  color: string;
  icon: string;
} {
  if (score >= 70) {
    return {
      level: 'verified',
      label: 'Verified',
      color: 'green',
      icon: '✓',
    };
  } else if (score >= 40) {
    return {
      level: 'partial',
      label: 'Partial',
      color: 'yellow',
      icon: '⚠',
    };
  } else {
    return {
      level: 'unverified',
      label: 'Unverified',
      color: 'gray',
      icon: '✗',
    };
  }
}

/**
 * Format trust score for display
 */
export function formatTrustScore(score: number): string {
  return `${Math.round(score)}/100`;
}

/**
 * Get verification method color
 */
export function getVerificationMethodColor(method: string): string {
  const colors: Record<string, string> = {
    'SimpleProof': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    'Iroh': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    'Account Age': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    'NIP-05': 'bg-green-500/20 text-green-400 border-green-500/30',
    'PKARR': 'bg-pink-500/20 text-pink-400 border-pink-500/30',
    'Kind:0': 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  };
  return colors[method] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
}

/**
 * Get verification method icon
 */
export function getVerificationMethodIcon(method: string): string {
  const icons: Record<string, string> = {
    'SimpleProof': '⛓️',
    'Iroh': '🌐',
    'Account Age': '📅',
    'NIP-05': '✓',
    'PKARR': '🔑',
    'Kind:0': '📝',
  };
  return icons[method] || '?';
}

/**
 * Get verification method description
 */
export function getVerificationMethodDescription(method: string): string {
  const descriptions: Record<string, string> = {
    'SimpleProof': 'Blockchain-anchored proof via Bitcoin',
    'Iroh': 'Decentralized node discovery via DHT',
    'Account Age': 'Verified account creation timestamp',
    'NIP-05': 'DNS-based identity verification',
    'PKARR': 'Decentralized PKARR verification',
    'Kind:0': 'Nostr metadata event verification',
  };
  return descriptions[method] || 'Unknown verification method';
}

/**
 * Calculate verification confidence (0-100)
 * Based on number of verification methods and their reliability
 */
export function calculateVerificationConfidence(breakdown: TrustScoreBreakdown): number {
  const methodCount = breakdown.verificationMethods.length;
  
  // More verification methods = higher confidence
  const baseConfidence = Math.min(methodCount * 15, 100);
  
  // Bonus for blockchain verification
  const hasBlockchain = breakdown.verificationMethods.includes('SimpleProof');
  const blockchainBonus = hasBlockchain ? 15 : 0;
  
  // Bonus for decentralized verification
  const hasDecentralized = breakdown.verificationMethods.includes('Iroh') || 
                          breakdown.verificationMethods.includes('PKARR');
  const decentralizedBonus = hasDecentralized ? 10 : 0;
  
  return Math.min(baseConfidence + blockchainBonus + decentralizedBonus, 100);
}

