/**
 * @fileoverview Family Foundry API Endpoints
 * @description Handles family charter creation, RBAC setup, and federation creation
 * @compliance Master Context - NIP-59 Gift Wrapped messaging, privacy-first, no email storage
 * @note Invitations use existing PostAuthInvitationModal system (/api/authenticated/generate-peer-invite)
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface CharterDefinition {
  familyName: string;
  familyMotto: string;
  foundingDate: string;
  missionStatement: string;
  values: string[];
}

interface RBACDefinition {
  roles: {
    id: string;
    name: string;
    description: string;
    rights: string[];
    responsibilities: string[];
    rewards: string[];
    hierarchyLevel: number;
  }[];
}

interface CreateFamilyFoundryRequest {
  charter: CharterDefinition;
  rbac: RBACDefinition;
}

interface CreateFamilyFoundryResponse {
  success: boolean;
  data?: {
    charterId: string;
    federationId?: string;
  };
  error?: string;
  message?: string;
}

export default async function handler(req: any, res: any) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const { charter, rbac }: CreateFamilyFoundryRequest = req.body;

    // Validate required fields
    if (!charter.familyName || !charter.foundingDate) {
      return res.status(400).json({
        success: false,
        error: 'Family name and founding date are required'
      });
    }

    // Validate RBAC roles
    const validRoles = ['guardian', 'steward', 'adult', 'offspring'];
    const hasValidRoles = rbac.roles.every(role => validRoles.includes(role.id));
    if (!hasValidRoles) {
      return res.status(400).json({
        success: false,
        error: 'Invalid RBAC roles. Must be: guardian, steward, adult, offspring'
      });
    }

    // Create family foundry using the database function
    const { data: charterId, error: createError } = await supabase.rpc('create_family_foundry', {
      p_family_name: charter.familyName,
      p_family_motto: charter.familyMotto,
      p_founding_date: charter.foundingDate,
      p_mission_statement: charter.missionStatement,
      p_core_values: JSON.stringify(charter.values),
      p_rbac_configs: JSON.stringify(rbac.roles)
    });

    if (createError) {
      console.error('Error creating family foundry:', createError);
      return res.status(500).json({
        success: false,
        error: 'Failed to create family foundry'
      });
    }

    // Create federation creation record
    const { data: federationRecord, error: federationError } = await supabase
      .from('family_federation_creations')
      .insert({
        charter_id: charterId,
        federation_name: charter.familyName,
        status: 'creating',
        progress: 0,
        created_by: req.headers['x-user-id'] as string
      })
      .select()
      .single();

    if (federationError) {
      console.error('Error creating federation record:', federationError);
      return res.status(500).json({
        success: false,
        error: 'Failed to create federation record'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        charterId,
        federationId: federationRecord.id
      },
      message: 'Family foundry created successfully'
    });

  } catch (error) {
    console.error('Family foundry creation error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
} 