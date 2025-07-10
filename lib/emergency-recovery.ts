import { supabase } from '../src/lib/supabase';
import { FederationRole } from '../src/types/auth';

// Define emergency types inline
interface EmergencyLog {
  id: string;
  timestamp: Date;
  eventType: string;
  userId: string;
  userNpub: string;
  userRole: FederationRole;
  guardianNpub?: string;
  guardianRole?: FederationRole;
  details: any;
  severity: 'info' | 'warning' | 'error' | 'critical';
}

interface EmergencyProtocol {
  type: string;
  reason: string;
  urgency: string;
} 