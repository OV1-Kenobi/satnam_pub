declare module "../../lib/unified-messaging-service.js" {
  import {
    DEFAULT_UNIFIED_CONFIG as DEFAULT_CONFIG,
    CentralEventPublishingService,
    type UnifiedMessagingConfig as _UnifiedMessagingConfig,
  } from "../../lib/central_event_publishing_service";

  export const DEFAULT_UNIFIED_CONFIG: typeof DEFAULT_CONFIG;
  export type UnifiedMessagingConfig = _UnifiedMessagingConfig;

  /**
   * Facade class re-exported as UnifiedMessagingService.
   * Accepts an optional config for type compatibility; extra constructor args are ignored at runtime.
   */
  export class UnifiedMessagingService extends CentralEventPublishingService {
    constructor(config?: UnifiedMessagingConfig);
  }

  export const central_event_publishing_service: CentralEventPublishingService;
}

