import { DomainManager } from '../../services/domain/DomainManager';
import { createDomain } from '../../services/domain/DomainService';
import { validateData } from '../../utils/validation';
import { domainConfigureSchema, DomainConfigData } from './domainConfigSchema';

// Factory to create the appropriate domain manager based on type
class DomainManagerFactory {
  static create(domainType: string): DomainManager {
    // This is a simplified implementation
    return new DomainManager(domainType);
  }
}

export async function POST(request: Request) {
  try {
    // Validate request data
    const requestData = await request.json();
    const { success, data, error } = validateData<DomainConfigData>(domainConfigureSchema, requestData);
    
    if (!success || !data) {
      return Response.json({ 
        success: false, 
        error: error?.errors || 'Invalid request data' 
      }, { status: 400 });
    }
    
    const { familyId, domainName, domainType, username, userPubkey, lightningEndpoint } = data as DomainConfigData;
    const domainProvider = DomainManagerFactory.create(domainType);
    
    if (
      typeof domainProvider.createNIP05Record !== 'function' ||
      typeof domainProvider.createLightningAddress !== 'function'
    ) {
      return Response.json(
        { success: false, error: 'Selected provider does not support NIP-05 / LN' },
        { status: 400 },
      );
    }
    
    // Perform external operations first
    try {
      // Configure NIP-05 and Lightning address
      await domainProvider.createNIP05Record(username, userPubkey);
      await domainProvider.createLightningAddress(username, lightningEndpoint);
    } catch (providerError) {
      // If external operations fail, return error without creating database record
      console.error('Provider configuration error:', providerError);
      return Response.json({ 
        success: false, 
        error: providerError instanceof Error ? providerError.message : 'Provider configuration failed'
      }, { status: 500 });
    }
    
    // Create domain record in database only after external operations succeed
    const domainRecord = await createDomain({
      family_id: familyId,
      domain_name: domainName,
      domain_type: domainType
    });
    
    return Response.json({
      success: true,
      domain_id: domainRecord.id,
      domain_type: domainType,
      nip05: `${username}@${domainName}`,
      lightning_address: `${username}@${domainName}`,
      sovereignty_level: domainType === 'pubky' ? 'full' : 'partial'
    });
  } catch (e) {
    console.error('Error configuring domain:', e);
    return Response.json({ 
      success: false, 
      error: e instanceof Error ? e.message : 'An unexpected error occurred'
    }, { status: 500 });
  }
}