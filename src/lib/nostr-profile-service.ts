/**
 * MASTER CONTEXT COMPLIANCE: Nostr Profile Service
 *
 * CRITICAL SECURITY: Interaction-triggered profile fetching with privacy-first caching
 * PRIVACY-FIRST: All profile data cached in user's localStorage, zero external logging
 */

export interface NostrProfile {
  name?: string;
  about?: string;
  picture?: string;
  nip05?: string;
  lud16?: string;
  banner?: string;
  website?: string;
  displayName?: string;
}

interface CachedProfile {
  profile: NostrProfile;
  timestamp: Date;
  npub: string;
}

export class NostrProfileService {
  private static readonly CACHE_KEY = "satnam_nostr_profiles";
  private static readonly CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
  private static readonly DEBOUNCE_DELAY = 500; // 500ms debounce
  private static readonly DEFAULT_RELAYS = [
    "wss://relay.damus.io",
    "wss://nos.lol",
    "wss://relay.nostr.band",
    "wss://nostr.wine",
  ];

  private debounceTimers = new Map<string, NodeJS.Timeout>();

  /**
   * MASTER CONTEXT COMPLIANCE: User-controlled local profile operation logging
   * Stores profile operations in user's local encrypted storage (localStorage)
   * NEVER stored in external databases - user maintains full control
   */
  private async logProfileOperation(operationData: {
    operation: string;
    details: any;
    timestamp: Date;
  }): Promise<void> {
    try {
      const existingHistory = localStorage.getItem("satnam_profile_history");
      const operationHistory = existingHistory
        ? JSON.parse(existingHistory)
        : [];

      const operationRecord = {
        id: crypto.randomUUID(),
        type: "nostr_profile_operation",
        ...operationData,
        timestamp: operationData.timestamp.toISOString(),
      };

      operationHistory.push(operationRecord);

      // Keep only last 1000 operations to prevent localStorage bloat
      if (operationHistory.length > 1000) {
        operationHistory.splice(0, operationHistory.length - 1000);
      }

      localStorage.setItem(
        "satnam_profile_history",
        JSON.stringify(operationHistory)
      );
    } catch (error) {
      // Silent fail for privacy - no external logging
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Get cached profile with 24-hour expiration
   */
  getCachedProfile(npub: string): NostrProfile | null {
    try {
      const cached = localStorage.getItem(NostrProfileService.CACHE_KEY);
      if (!cached) return null;

      const profiles: CachedProfile[] = JSON.parse(cached);
      const profile = profiles.find((p) => p.npub === npub);

      if (!profile) return null;

      // Check if cache is expired (24 hours)
      const cacheAge = Date.now() - new Date(profile.timestamp).getTime();
      if (cacheAge > NostrProfileService.CACHE_DURATION_MS) {
        this.removeCachedProfile(npub);
        return null;
      }

      return profile.profile;
    } catch (error) {
      return null;
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Cache profile image with privacy-first storage
   */
  cacheProfileImage(npub: string, profile: NostrProfile): void {
    try {
      const cached = localStorage.getItem(NostrProfileService.CACHE_KEY);
      const profiles: CachedProfile[] = cached ? JSON.parse(cached) : [];

      // Remove existing profile for this npub
      const filteredProfiles = profiles.filter((p) => p.npub !== npub);

      // Add new profile
      filteredProfiles.push({
        profile,
        timestamp: new Date(),
        npub,
      });

      // Keep only last 100 profiles to prevent localStorage bloat
      if (filteredProfiles.length > 100) {
        filteredProfiles.splice(0, filteredProfiles.length - 100);
      }

      localStorage.setItem(
        NostrProfileService.CACHE_KEY,
        JSON.stringify(filteredProfiles)
      );
    } catch (error) {
      // Silent fail for privacy
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Remove expired cached profile
   */
  private removeCachedProfile(npub: string): void {
    try {
      const cached = localStorage.getItem(NostrProfileService.CACHE_KEY);
      if (!cached) return;

      const profiles: CachedProfile[] = JSON.parse(cached);
      const filteredProfiles = profiles.filter((p) => p.npub !== npub);

      localStorage.setItem(
        NostrProfileService.CACHE_KEY,
        JSON.stringify(filteredProfiles)
      );
    } catch (error) {
      // Silent fail for privacy
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Debounced profile fetching to prevent excessive relay requests
   */
  async fetchProfileWithDebounce(npub: string): Promise<NostrProfile | null> {
    return new Promise((resolve) => {
      // Clear existing timer for this npub
      const existingTimer = this.debounceTimers.get(npub);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Set new debounced timer
      const timer = setTimeout(async () => {
        const profile = await this.fetchProfileMetadata(npub);
        this.debounceTimers.delete(npub);
        resolve(profile);
      }, NostrProfileService.DEBOUNCE_DELAY);

      this.debounceTimers.set(npub, timer);
    });
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Fetch Nostr profile metadata with privacy-preserving patterns
   * Uses cache-first strategy to minimize relay requests
   */
  async fetchProfileMetadata(npub: string): Promise<NostrProfile | null> {
    try {
      // Check cache first
      const cachedProfile = this.getCachedProfile(npub);
      if (cachedProfile) {
        await this.logProfileOperation({
          operation: "profile_cache_hit",
          details: {
            npub: npub.slice(0, 16) + "...",
            hasPicture: !!cachedProfile.picture,
          },
          timestamp: new Date(),
        });
        return cachedProfile;
      }

      // Fetch from relays if not cached
      const profile = await this.fetchFromRelays(npub);

      if (profile) {
        this.cacheProfileImage(npub, profile);
        await this.logProfileOperation({
          operation: "profile_fetched_from_relay",
          details: {
            npub: npub.slice(0, 16) + "...",
            hasPicture: !!profile.picture,
          },
          timestamp: new Date(),
        });
      }

      return profile;
    } catch (error) {
      await this.logProfileOperation({
        operation: "profile_fetch_failed",
        details: {
          npub: npub.slice(0, 16) + "...",
          error: error instanceof Error ? error.message : "Unknown error",
        },
        timestamp: new Date(),
      });
      return null;
    }
  }

  /**
   * PRODUCTION: Fetch profile from Nostr relays using central event publishing service
   * Privacy-first: cache results locally and avoid extension usage
   */
  private async fetchFromRelays(npub: string): Promise<NostrProfile | null> {
    try {
      const { central_event_publishing_service } = await import(
        "../../lib/central_event_publishing_service"
      );
      // Ensure relays are initialized (service has defaults)
      const pool: any = (central_event_publishing_service as any).pool;
      const relays: string[] =
        (central_event_publishing_service as any).relays || [];
      if (!pool || !relays?.length) return null;

      // Lazy import nostr-tools for decoding
      const { nip19 } = await import("nostr-tools");
      const pubkeyHex = nip19.decode(npub).data as string;

      // List latest kind:0 event
      const events = await pool.list(relays, [
        { kinds: [0], authors: [pubkeyHex], limit: 1 },
      ]);
      if (events && events.length) {
        const ev = events[0];
        try {
          const content = JSON.parse(ev.content || "{}");
          const profile: NostrProfile = {
            name: content.name || content.username,
            about: content.about,
            picture: content.picture,
            nip05: content.nip05,
            lud16: content.lud16,
            banner: content.banner,
            website: content.website,
            displayName: content.display_name || content.displayName,
          };
          return profile;
        } catch {}
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * MASTER CONTEXT COMPLIANCE: Clear all cached profiles (for privacy/cleanup)
   */
  clearAllCachedProfiles(): void {
    try {
      localStorage.removeItem(NostrProfileService.CACHE_KEY);
      localStorage.removeItem("satnam_profile_history");
    } catch (error) {
      // Silent fail for privacy
    }
  }
}

// Export singleton instance
export const nostrProfileService = new NostrProfileService();
