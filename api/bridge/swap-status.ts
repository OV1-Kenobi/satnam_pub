// File: api/bridge/swap-status.ts
import { createClient } from "@supabase/supabase-js";
import type { Request, Response } from "express";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: Request, res: Response) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { swapId } = req.query;

  if (!swapId || typeof swapId !== "string") {
    return res.status(400).json({ error: "Swap ID is required" });
  }

  try {
    const { data: swapRecord, error } = await supabase
      .from("atomic_swaps")
      .select("*")
      .eq("swap_id", swapId)
      .single();

    if (error || !swapRecord) {
      return res.status(404).json({ error: "Swap not found" });
    }

    // Also get the swap logs
    const { data: swapLogs } = await supabase
      .from("atomic_swap_logs")
      .select("*")
      .eq("swap_id", swapId)
      .order("step_number", { ascending: true });

    return res.json({
      success: true,
      swap: swapRecord,
      logs: swapLogs || [],
    });
  } catch (error) {
    console.error("Error fetching swap status:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch swap status",
    });
  }
}
