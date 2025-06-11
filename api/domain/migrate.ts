import { PubkyDNSProvider } from '../../services/domain/providers/PubkyDNSProvider';

export async function POST(request: Request) {
  const { fromDomain, toDomain, domainType } = await request.json();
  
  // Migrate from traditional to Pubky domain
  if (domainType === 'pubky') {
    const pubkyProvider = new PubkyDNSProvider();
    await pubkyProvider.migrateDNSRecords(fromDomain, toDomain);
  }
  
  return Response.json({ migration_status: 'complete' });
}