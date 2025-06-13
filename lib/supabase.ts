// lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://rhfqfftkizyengcuhuvq.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoZnFmZnRraXp5ZW5nY3VodXZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk3NjA1ODQsImV4cCI6MjA2NTMzNjU4NH0.T9UoL9ozgIzpqDBrY9qefq4V9bCbbenYkO5bTRrdhQE";

export const supabase = createClient(supabaseUrl, supabaseKey);

// Database service layer
export class CitadelDatabase {
  // Create user profile after Nostr identity creation
  static async createUserProfile(userData: {
    id: string;
    username: string;
    npub: string;
    nip05: string;
    lightning_address: string;
    family_id?: string;
  }) {
    const { data, error } = await supabase
      .from("profiles")
      .insert(userData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Get family members
  static async getFamilyMembers(familyId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("family_id", familyId);

    if (error) throw error;
    return data;
  }

  // Store Nostr event reference
  static async storeNostrBackup(userId: string, eventId: string) {
    const { data, error } = await supabase.from("nostr_backups").insert({
      user_id: userId,
      event_id: eventId,
      relay_url: "wss://relay.citadel.academy",
    });

    if (error) throw error;
    return data;
  }

  // Create a family
  static async createFamily(familyData: {
    family_name: string;
    domain?: string;
    relay_url?: string;
    federation_id?: string;
  }) {
    const { data, error } = await supabase
      .from("families")
      .insert(familyData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Join a family
  static async joinFamily(userId: string, familyId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .update({ family_id: familyId })
      .eq("id", userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Set up lightning address
  static async setupLightningAddress(addressData: {
    user_id: string;
    address: string;
    btcpay_store_id?: string;
    voltage_node_id?: string;
    active?: boolean;
  }) {
    // First deactivate existing addresses
    await supabase
      .from("lightning_addresses")
      .update({ active: false })
      .eq("user_id", addressData.user_id);

    // Create new active address
    const { data, error } = await supabase
      .from("lightning_addresses")
      .insert({ ...addressData, active: true })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Get complete user identity
  static async getUserIdentity(userId: string) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        `
        *,
        families(*),
        lightning_addresses(*),
        nostr_backups(*)
      `,
      )
      .eq("id", userId)
      .single();

    if (profileError) throw profileError;
    return profile;
  }

  // Get user backups
  static async getUserBackups(userId: string) {
    const { data, error } = await supabase
      .from("nostr_backups")
      .select("*")
      .eq("user_id", userId);

    if (error) throw error;
    return data;
  }

  // Get user lightning data
  static async getUserLightning(userId: string) {
    const { data, error } = await supabase
      .from("lightning_addresses")
      .select("*")
      .eq("user_id", userId);

    if (error) throw error;
    return data;
  }
}
