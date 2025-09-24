/*
 * Trust Score Calculation Service (library)
 * - Privacy-first: pure function, caller provides inputs
 * - Outputs total score (0-100), component breakdown, and qualitative level
 */

export type TrustInputs = {
  physicallyVerified?: boolean;
  vpVerified?: boolean;
  socialAttestations?: {
    count: number; // total attestations
    distinctIssuers?: number; // unique issuers
    recentCount30d?: number; // attestations in last 30 days
  };
  recencyDays?: number; // days since last contact/verification
};

export type TrustScore = {
  score: number; // 0..100
  components: {
    physical: number;
    vp: number;
    social: number;
    recencyPenalty: number;
  };
  level: "high" | "medium" | "low";
};

export function computeTrustScore(input: TrustInputs): TrustScore {
  const physical = input.physicallyVerified ? 30 : 0;
  const vp = input.vpVerified ? 30 : 0;

  const sa = input.socialAttestations || { count: 0, distinctIssuers: 0, recentCount30d: 0 };
  const socialRaw = (sa.count || 0) * 5 + (sa.distinctIssuers || 0) * 2 + (sa.recentCount30d || 0) * 1;
  const social = Math.max(0, Math.min(30, socialRaw));

  const recency = typeof input.recencyDays === 'number' ? input.recencyDays : 0;
  // Penalty scales from 0 at <= 60d to -15 at >= 180d
  const recencyPenalty = recency <= 60 ? 0 : recency >= 180 ? -15 : -Math.round(((recency - 60) / 120) * 15);

  let score = physical + vp + social + recencyPenalty;
  score = Math.max(0, Math.min(100, score));

  const level: TrustScore["level"] = score >= 75 ? "high" : score >= 40 ? "medium" : "low";

  return {
    score,
    components: { physical, vp, social, recencyPenalty },
    level,
  };
}

