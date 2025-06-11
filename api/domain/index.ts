// Import and re-export with explicit names to avoid conflicts
import { POST as ConfigurePOST } from "./configure";
import { POST as MigratePOST } from "./migrate";

// Re-export the schema and types from domainConfigSchema
import { domainConfigureSchema, type DomainConfigData } from './domainConfigSchema';

// Export everything with explicit names to avoid ambiguity
export {
  ConfigurePOST,
  MigratePOST,
  domainConfigureSchema,
  // Use 'export type' for type exports when isolatedModules is enabled
  type DomainConfigData
};