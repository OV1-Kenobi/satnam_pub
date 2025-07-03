// Internal Lightning Bridge - Base Class and Configuration
// File: src/lib/internal-lightning-bridge.ts
import { supabase } from "../../lib/supabase";
import { SatnamCrossMintCashuManager } from "./cross-mint-cashu-manager";
import { FedimintClient } from "./fedimint-client";
import { PhoenixdClient } from "./phoenixd-client";

interface AtomicSwapRequest {
  fromContext: "family" | "individual";
  toContext: "family" | "individual";
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  swapType:
    | "fedimint_to_lightning"
    | "fedimint_to_cashu"
    | "lightning_to_fedimint"
    | "cashu_to_fedimint";
  purpose: "payment" | "gift" | "emergency" | "transfer";
  requiresApproval: boolean;
}

interface AtomicSwapResult {
  success: boolean;
  swapId: string;
  fromTxId: string;
  bridgeTxId: string;
  toTxId: string;
  amount: number;
  fees: {
    fedimintFee: number;
    lightningFee: number;
    cashuFee: number;
    totalFee: number;
  };
  timestamp: Date;
  error?: string;
}

interface SwapStep {
  step: number;
  description: string;
  status: "pending" | "processing" | "completed" | "failed";
  txId?: string;
  error?: string;
}

class SatnamInternalLightningBridge {
  private phoenixd: PhoenixdClient;
  private fedimint: FedimintClient;
  private cashuManager: SatnamCrossMintCashuManager;
  private supabase: any;

  constructor() {
    this.phoenixd = new PhoenixdClient();

    this.fedimint = new FedimintClient();

    this.cashuManager = new SatnamCrossMintCashuManager();

    // Use the shared supabase client to prevent multiple GoTrueClient instances
    this.supabase = supabase;
  }

  // Utility methods
  private generateSwapId(): string {
    return `swap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async logSwapStep(swapId: string, step: SwapStep): Promise<void> {
    try {
      await this.supabase.from("atomic_swap_logs").insert({
        swap_id: swapId,
        step_number: step.step,
        description: step.description,
        status: step.status,
        tx_id: step.txId,
        error: step.error,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Failed to log swap step:", error);
    }
  }

  private async updateSwapStatus(
    swapId: string,
    status: string,
    error?: string
  ): Promise<void> {
    try {
      await this.supabase
        .from("atomic_swaps")
        .update({
          status,
          error,
          updated_at: new Date().toISOString(),
        })
        .eq("swap_id", swapId);
    } catch (error) {
      console.error("Failed to update swap status:", error);
    }
  }

  // Main atomic swap method - Fedimint to Cashu via Lightning
  async executeFedimintToCashuSwap(
    request: AtomicSwapRequest
  ): Promise<AtomicSwapResult> {
    const swapId = this.generateSwapId();
    const startTime = new Date();

    try {
      // Initialize swap record
      await this.supabase.from("atomic_swaps").insert({
        swap_id: swapId,
        from_context: request.fromContext,
        to_context: request.toContext,
        from_member_id: request.fromMemberId,
        to_member_id: request.toMemberId,
        amount: request.amount,
        swap_type: request.swapType,
        purpose: request.purpose,
        requires_approval: request.requiresApproval,
        status: "initiated",
        created_at: startTime.toISOString(),
      });

      // Step 1: Convert Fedimint eCash to Lightning Invoice
      await this.logSwapStep(swapId, {
        step: 1,
        description: "Converting Fedimint eCash to Lightning",
        status: "processing",
      });

      const lightningInvoice = await this.fedimint.createLightningInvoice({
        amount: request.amount,
        description: `Atomic swap ${swapId} - Fedimint to Lightning`,
        memberId: request.fromMemberId,
      });

      if (!lightningInvoice.success) {
        throw new Error(
          `Fedimint to Lightning conversion failed: ${lightningInvoice.error}`
        );
      }

      await this.logSwapStep(swapId, {
        step: 1,
        description: "Fedimint eCash converted to Lightning",
        status: "completed",
        txId: lightningInvoice.invoiceId,
      });

      // Step 2: Process Lightning payment through PhoenixD
      await this.logSwapStep(swapId, {
        step: 2,
        description: "Processing Lightning payment",
        status: "processing",
      });

      const lightningPayment = await this.phoenixd.payInvoice({
        invoice: lightningInvoice.paymentRequest,
        amount: request.amount,
      });

      if (!lightningPayment.success) {
        throw new Error(`Lightning payment failed: ${lightningPayment.error}`);
      }

      await this.logSwapStep(swapId, {
        step: 2,
        description: "Lightning payment processed",
        status: "completed",
        txId: lightningPayment.paymentHash,
      });

      // Step 3: Convert Lightning to Cashu eCash
      await this.logSwapStep(swapId, {
        step: 3,
        description: "Converting Lightning to Cashu eCash",
        status: "processing",
      });

      const cashuToken = await this.cashuManager.mintFromLightning({
        amount: request.amount,
        lightningPaymentHash: lightningPayment.paymentHash,
        recipientMemberId: request.toMemberId,
        purpose: request.purpose,
      });

      if (!cashuToken.success) {
        throw new Error(
          `Lightning to Cashu conversion failed: ${cashuToken.error}`
        );
      }

      await this.logSwapStep(swapId, {
        step: 3,
        description: "Cashu eCash minted successfully",
        status: "completed",
        txId: cashuToken.tokenId,
      });

      // Calculate fees
      const fees = {
        fedimintFee: lightningInvoice.fee || 0,
        lightningFee: lightningPayment.fee || 0,
        cashuFee: cashuToken.fee || 0,
        totalFee:
          (lightningInvoice.fee || 0) +
          (lightningPayment.fee || 0) +
          (cashuToken.fee || 0),
      };

      // Update final status
      await this.updateSwapStatus(swapId, "completed");

      return {
        success: true,
        swapId,
        fromTxId: lightningInvoice.invoiceId,
        bridgeTxId: lightningPayment.paymentHash,
        toTxId: cashuToken.tokenId,
        amount: request.amount,
        fees,
        timestamp: startTime,
      };
    } catch (error) {
      console.error("Atomic swap failed:", error);

      await this.updateSwapStatus(
        swapId,
        "failed",
        error instanceof Error ? error.message : "Unknown error"
      );

      return {
        success: false,
        swapId,
        fromTxId: "",
        bridgeTxId: "",
        toTxId: "",
        amount: request.amount,
        fees: {
          fedimintFee: 0,
          lightningFee: 0,
          cashuFee: 0,
          totalFee: 0,
        },
        timestamp: startTime,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Reverse swap - Cashu to Fedimint via Lightning
  async executeCashuToFedimintSwap(
    request: AtomicSwapRequest
  ): Promise<AtomicSwapResult> {
    const swapId = this.generateSwapId();
    const startTime = new Date();

    try {
      // Initialize swap record
      await this.supabase.from("atomic_swaps").insert({
        swap_id: swapId,
        from_context: request.fromContext,
        to_context: request.toContext,
        from_member_id: request.fromMemberId,
        to_member_id: request.toMemberId,
        amount: request.amount,
        swap_type: request.swapType,
        purpose: request.purpose,
        requires_approval: request.requiresApproval,
        status: "initiated",
        created_at: startTime.toISOString(),
      });

      // Step 1: Convert Cashu eCash to Lightning
      await this.logSwapStep(swapId, {
        step: 1,
        description: "Converting Cashu eCash to Lightning",
        status: "processing",
      });

      const lightningPayment = await this.cashuManager.meltToLightning({
        amount: request.amount,
        memberId: request.fromMemberId,
        description: `Atomic swap ${swapId} - Cashu to Lightning`,
      });

      if (!lightningPayment.success) {
        throw new Error(
          `Cashu to Lightning conversion failed: ${lightningPayment.error}`
        );
      }

      await this.logSwapStep(swapId, {
        step: 1,
        description: "Cashu eCash melted to Lightning",
        status: "completed",
        txId: lightningPayment.paymentHash,
      });

      // Step 2: Convert Lightning to Fedimint eCash
      await this.logSwapStep(swapId, {
        step: 2,
        description: "Converting Lightning to Fedimint eCash",
        status: "processing",
      });

      const fedimintDeposit = await this.fedimint.depositFromLightning({
        amount: request.amount,
        lightningPaymentHash: lightningPayment.paymentHash,
        memberId: request.toMemberId,
        purpose: request.purpose,
      });

      if (!fedimintDeposit.success) {
        throw new Error(
          `Lightning to Fedimint conversion failed: ${fedimintDeposit.error}`
        );
      }

      await this.logSwapStep(swapId, {
        step: 2,
        description: "Fedimint eCash deposited successfully",
        status: "completed",
        txId: fedimintDeposit.depositId,
      });

      // Calculate fees
      const fees = {
        fedimintFee: fedimintDeposit.fee || 0,
        lightningFee: lightningPayment.fee || 0,
        cashuFee: lightningPayment.cashuFee || 0,
        totalFee:
          (fedimintDeposit.fee || 0) +
          (lightningPayment.fee || 0) +
          (lightningPayment.cashuFee || 0),
      };

      // Update final status
      await this.updateSwapStatus(swapId, "completed");

      return {
        success: true,
        swapId,
        fromTxId: lightningPayment.cashuTxId || "",
        bridgeTxId: lightningPayment.paymentHash,
        toTxId: fedimintDeposit.depositId,
        amount: request.amount,
        fees,
        timestamp: startTime,
      };
    } catch (error) {
      console.error("Reverse atomic swap failed:", error);

      await this.updateSwapStatus(
        swapId,
        "failed",
        error instanceof Error ? error.message : "Unknown error"
      );

      return {
        success: false,
        swapId,
        fromTxId: "",
        bridgeTxId: "",
        toTxId: "",
        amount: request.amount,
        fees: {
          fedimintFee: 0,
          lightningFee: 0,
          cashuFee: 0,
          totalFee: 0,
        },
        timestamp: startTime,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Get swap status and history
  async getSwapStatus(swapId: string): Promise<any> {
    try {
      const { data: swap } = await this.supabase
        .from("atomic_swaps")
        .select("*")
        .eq("swap_id", swapId)
        .single();

      const { data: logs } = await this.supabase
        .from("atomic_swap_logs")
        .select("*")
        .eq("swap_id", swapId)
        .order("step_number", { ascending: true });

      return {
        success: true,
        swap,
        logs,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Main atomic swap orchestrator
  async executeAtomicSwap(
    request: AtomicSwapRequest
  ): Promise<AtomicSwapResult> {
    const swapId = this.generateSwapId();

    try {
      // 1. Validate swap request and check balances
      await this.validateSwapRequest(request);

      // 2. Check guardian approval (always check, let the function determine if needed)
      const approval = await this.checkGuardianApproval(request, swapId);
      if (!approval.approved) {
        throw new Error(approval.reason || "Guardian approval required");
      }
      // 3. Execute the appropriate swap based on type
      let swapResult: AtomicSwapResult;

      switch (request.swapType) {
        case "fedimint_to_lightning":
          swapResult = await this.executeFedimintToLightning(request, swapId);
          break;
        case "fedimint_to_cashu":
          swapResult = await this.executeFedimintToCashu(request, swapId);
          break;
        case "lightning_to_fedimint":
          swapResult = await this.executeLightningToFedimint(request, swapId);
          break;
        case "cashu_to_fedimint":
          swapResult = await this.executeCashuToFedimint(request, swapId);
          break;
        default:
          throw new Error(`Unsupported swap type: ${request.swapType}`);
      }
      // 4. Log successful swap for audit trail
      await this.logAtomicSwap(swapResult);

      return swapResult;
    } catch (error) {
      console.error(`Atomic swap ${swapId} failed:`, error);

      // Attempt rollback of any partial transactions
      await this.rollbackFailedSwap(swapId, request);

      return {
        success: false,
        swapId,
        fromTxId: "",
        bridgeTxId: "",
        toTxId: "",
        amount: request.amount,
        fees: { fedimintFee: 0, lightningFee: 0, cashuFee: 0, totalFee: 0 },
        timestamp: new Date(),
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Fedimint eCash to Individual Lightning atomic swap
  private async executeFedimintToLightning(
    request: AtomicSwapRequest,
    swapId: string
  ): Promise<AtomicSwapResult> {
    const startTime = Date.now();

    // Step 1: Create Lightning invoice for the recipient
    const lightningInvoice = await this.phoenixd.createInvoice({
      amount: request.amount,
      description: `Atomic swap ${swapId}: Family to Individual transfer`,
      expiry: 3600, // 1 hour expiry
      metadata: {
        swapId,
        fromMemberId: request.fromMemberId,
        toMemberId: request.toMemberId,
        purpose: request.purpose,
      },
    });
    // Step 2: Redeem Fedimint eCash and pay Lightning invoice atomically
    const fedimintRedemption = await this.fedimint.atomicRedeemToPay({
      memberId: request.fromMemberId,
      amount: request.amount,
      lightningInvoice: lightningInvoice.paymentRequest,
      swapId,
    });
    if (!fedimintRedemption.success) {
      throw new Error(
        `Fedimint redemption failed: ${fedimintRedemption.error}`
      );
    }
    // Step 3: Verify Lightning payment was received
    const lightningPayment = await this.phoenixd.waitForPayment(
      lightningInvoice.paymentHash,
      30000 // 30 second timeout
    );
    if (!lightningPayment.success) {
      // Rollback Fedimint transaction
      await this.fedimint.rollbackRedemption(fedimintRedemption.txId);
      throw new Error("Lightning payment not received within timeout");
    }
    // Step 4: Credit individual Lightning wallet
    await this.creditIndividualLightningWallet(
      request.toMemberId,
      request.amount,
      lightningPayment.paymentHash
    );
    return {
      success: true,
      swapId,
      fromTxId: fedimintRedemption.txId,
      bridgeTxId: lightningPayment.paymentHash,
      toTxId: lightningInvoice.paymentHash,
      amount: request.amount,
      fees: {
        fedimintFee: fedimintRedemption.fee,
        lightningFee: lightningPayment.fee,
        cashuFee: 0,
        totalFee: fedimintRedemption.fee + lightningPayment.fee,
      },
      timestamp: new Date(),
    };
  }

  // Fedimint eCash to Individual Cashu atomic swap
  private async executeFedimintToCashu(
    request: AtomicSwapRequest,
    swapId: string
  ): Promise<AtomicSwapResult> {
    // Step 1: Create Lightning invoice for Cashu minting
    const cashuMintRequest = await this.cashuManager.requestMint(
      request.amount
    );

    // Step 2: Redeem Fedimint eCash to pay Cashu mint invoice
    const fedimintRedemption = await this.fedimint.atomicRedeemToPay({
      memberId: request.fromMemberId,
      amount: request.amount,
      lightningInvoice: cashuMintRequest.pr,
      swapId,
    });
    if (!fedimintRedemption.success) {
      throw new Error(
        `Fedimint redemption failed: ${fedimintRedemption.error}`
      );
    }
    // Step 3: Complete Cashu minting
    const cashuTokens = await this.cashuManager.completeMint(
      cashuMintRequest.hash,
      request.amount
    );
    if (!cashuTokens.success) {
      // Rollback Fedimint transaction
      await this.fedimint.rollbackRedemption(fedimintRedemption.txId);
      throw new Error("Cashu minting failed");
    }
    // Step 4: Credit individual Cashu wallet
    await this.creditIndividualCashuWallet(
      request.toMemberId,
      cashuTokens.tokens,
      request.amount
    );
    return {
      success: true,
      swapId,
      fromTxId: fedimintRedemption.txId,
      bridgeTxId: cashuMintRequest.hash,
      toTxId: cashuTokens.tokenId,
      amount: request.amount,
      fees: {
        fedimintFee: fedimintRedemption.fee,
        lightningFee: 0,
        cashuFee: cashuTokens.fee,
        totalFee: fedimintRedemption.fee + cashuTokens.fee,
      },
      timestamp: new Date(),
    };
  }

  // Swap validation
  private async validateSwapRequest(request: AtomicSwapRequest): Promise<void> {
    // Validate amount
    if (request.amount <= 0) {
      throw new Error("Swap amount must be greater than 0");
    }
    // Validate members exist
    const { data: fromMember } = await this.supabase
      .from("family_members")
      .select("id, role")
      .eq("id", request.fromMemberId)
      .single();
    const { data: toMember } = await this.supabase
      .from("family_members")
      .select("id, role")
      .eq("id", request.toMemberId)
      .single();
    if (!fromMember || !toMember) {
      throw new Error("Invalid family member IDs");
    }
    // Check sufficient balance based on swap type
    if (request.swapType.startsWith("fedimint_")) {
      const fedimintBalance = await this.fedimint.getBalance(
        request.fromMemberId
      );
      if (fedimintBalance < request.amount) {
        throw new Error("Insufficient Fedimint eCash balance");
      }
    }
  }

  // Guardian approval check
  private async checkGuardianApproval(
    request: AtomicSwapRequest,
    swapId: string
  ): Promise<{ approved: boolean; reason?: string }> {
    // Check if amount requires guardian approval
    const { data: familyMember } = await this.supabase
      .from("family_members")
      .select("role, spending_limits")
      .eq("id", request.fromMemberId)
      .single();
    if (!familyMember) {
      return { approved: false, reason: "Family member not found" };
    }
    // Parents have unlimited spending
    if (familyMember.role === "adult" || familyMember.role === "guardian") {
      return { approved: true };
    }
    // Check spending limits for children
    if (
      familyMember.spending_limits?.requiresApproval &&
      request.amount > familyMember.spending_limits.requiresApproval
    ) {
      // Check for existing guardian approval
      const { data: approval } = await this.supabase
        .from("guardian_approvals")
        .select("*")
        .eq("swap_id", swapId)
        .eq("status", "approved")
        .single();
      if (!approval) {
        return {
          approved: false,
          reason: `Amount ${request.amount} sats exceeds limit, guardian approval required`,
        };
      }
    }
    return { approved: true };
  }

  // Helper methods for wallet operations
  private async creditIndividualLightningWallet(
    memberId: string,
    amount: number,
    paymentHash: string
  ): Promise<void> {
    await this.supabase
      .from("individual_lightning_wallets")
      .update({
        balance: this.supabase.raw("balance + ?", [amount]),
        updated_at: new Date().toISOString(),
      })
      .eq("member_id", memberId);

    await this.supabase.from("individual_lightning_transactions").insert({
      member_id: memberId,
      amount,
      type: "credit",
      payment_hash: paymentHash,
      description: "Atomic swap from family Fedimint eCash",
    });
  }

  private async creditIndividualCashuWallet(
    memberId: string,
    tokens: string,
    amount: number
  ): Promise<void> {
    await this.supabase
      .from("individual_cashu_wallets")
      .update({
        balance: this.supabase.raw("balance + ?", [amount]),
        updated_at: new Date().toISOString(),
      })
      .eq("member_id", memberId);

    await this.supabase.from("individual_cashu_tokens").insert({
      member_id: memberId,
      tokens,
      amount,
      status: "active",
      source: "atomic_swap_from_fedimint",
    });
  }

  private async logAtomicSwap(result: AtomicSwapResult): Promise<void> {
    await this.supabase.from("atomic_swaps").insert({
      swap_id: result.swapId,
      success: result.success,
      amount: result.amount,
      from_tx_id: result.fromTxId,
      bridge_tx_id: result.bridgeTxId,
      to_tx_id: result.toTxId,
      total_fees: result.fees.totalFee,
      timestamp: result.timestamp,
      error: result.error,
    });
  }

  private async rollbackFailedSwap(
    swapId: string,
    request: AtomicSwapRequest
  ): Promise<void> {
    console.log(`Attempting rollback for failed swap ${swapId}`);
    // Implementation would attempt to reverse any partial transactions
    // This is complex and depends on the specific failure point
  }
}

export { AtomicSwapRequest, AtomicSwapResult, SatnamInternalLightningBridge };
