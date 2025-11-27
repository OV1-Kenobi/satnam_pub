/**
 * Geochat Module - Geo Discovery, Live Messaging, Trust & Contacts
 *
 * Barrel export for:
 * - Phase 1: Read-only geo discovery
 * - Phase 2: Deterministic relay messaging
 * - Phase 3: Trust, contacts, private messaging, Physical MFA verification
 *
 * @module src/lib/geochat
 */

// Phase 1 Types
export type {
  GeoPrecision,
  GeohashSource,
  GeoRoomSelection,
  GeoDiscoveryState,
  GeoRoomPreview,
  GeoRoomRelayPreview,
  GeoConsentStatus,
  GeoErrorCode,
} from "./types";

// Phase 2 Types
export type {
  GeoRoomErrorKind,
  GeoRoomSubscription,
  SubscribeToGeoRoomParams,
  PublishGeoRoomMessageParams,
  PublishGeoRoomMessageResult,
  GeoRoomServiceConfig,
  GeoRoomState,
  GeoRoomActions,
} from "./types";

// Phase 3 Types - Contacts & Trust
export type {
  GeoContactContext,
  GeoRoomContactActionType,
  GeoRoomContactAction,
  PhysicalMFAAttestationScope,
  PhysicalMFAAttestation,
  MFAChallenge,
  VerifyContactWithPhysicalMFAParams,
  VerifyContactWithPhysicalMFAResult,
  AddContactFromGeoMessageParams,
  AddContactFromGeoMessageResult,
  StartPrivateChatParams,
  StartPrivateChatResult,
  IdentitySharingPayload,
  EphemeralGeoKeyRecord,
  Phase3ErrorKind,
} from "./types";

// Classes and Constants
export {
  GeoDiscoveryError,
  GeoRoomError,
  Phase3Error,
  GEOHASH_PRECISION_MAP,
  GEO_CONSENT_STORAGE_KEY,
  GEO_CONSENT_VERSION,
  DEFAULT_GEO_ROOM_CONFIG,
  EPHEMERAL_KEY_CONSTANTS,
} from "./types";

// Phase 1 Utilities
export {
  normalizeGeohash,
  resolveGeoPrecision,
  getApproximateRadius,
  getRadiusDescription,
  validateGeohash,
  getGeohashFromBrowserLocation,
  buildGeoRoomPreview,
  isValidGeohash,
} from "./geo-utils";

// Phase 2 Service Functions
export {
  publishGeoRoomMessage,
  subscribeToGeoRoom,
  mapGeoRoomErrorToMessage,
  getGeoRoomConfig,
} from "./geo-room-service";

// Phase 3 Service Functions - Contacts, Trust, Physical MFA
export {
  addContactFromGeoMessage,
  verifyContactWithPhysicalMFA,
  truncateGeohashForPrivacy,
  serializeMFAChallengeJCS,
  verifyMFASignature,
  storeAttestationInVault,
  shareAttestationViaDM,
} from "./geo-room-service";
