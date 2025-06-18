// hooks/useFedimint.ts
import { FedimintClient } from "@/lib/fedimint/client";
import { FederationManager } from "@/lib/fedimint/federation-manager";
import { FederationInfo } from "@/lib/fedimint/types";
import { useCallback, useEffect, useRef, useState } from "react";

// Singleton pattern to ensure only one manager instance
let federationManager: FederationManager | null = null;

const getFederationManager = () => {
  if (!federationManager) {
    federationManager = new FederationManager();
  }
  return federationManager;
};

export function useFedimint() {
  const [federations, setFederations] = useState<FederationInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadFederations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const manager = getFederationManager();
      const feds = manager.listFederations();

      if (mountedRef.current) {
        setFederations(feds);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(
          err instanceof Error ? err.message : "Failed to load federations",
        );
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const createFederation = useCallback(
    async (
      name: string,
      description: string,
      guardianUrls: string[],
      threshold: number,
    ) => {
      try {
        if (mountedRef.current) {
          setLoading(true);
          setError(null);
        }

        const manager = getFederationManager();
        const federationId = await manager.createFederation(
          name,
          description,
          guardianUrls,
          threshold,
        );

        await loadFederations();
        return federationId;
      } catch (err) {
        if (mountedRef.current) {
          setError(
            err instanceof Error ? err.message : "Failed to create federation",
          );
        }
        throw err;
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [loadFederations],
  );

  const joinFederation = useCallback(
    async (inviteCode: string) => {
      try {
        if (mountedRef.current) {
          setLoading(true);
          setError(null);
        }

        const manager = getFederationManager();
        const federationId = await manager.joinFederation(inviteCode);
        await loadFederations();
        return federationId;
      } catch (err) {
        if (mountedRef.current) {
          setError(
            err instanceof Error ? err.message : "Failed to join federation",
          );
        }
        throw err;
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [loadFederations],
  );

  const connectToFederation = useCallback(async (federationId: string) => {
    try {
      if (mountedRef.current) {
        setLoading(true);
        setError(null);
      }

      const manager = getFederationManager();
      const connected = await manager.connectToFederation(federationId);
      return connected;
    } catch (err) {
      if (mountedRef.current) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to connect to federation",
        );
      }
      throw err;
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const deleteFederation = useCallback(
    async (federationId: string) => {
      try {
        if (mountedRef.current) {
          setLoading(true);
          setError(null);
        }

        const manager = getFederationManager();
        await manager.deleteFederation(federationId);
        await loadFederations();
      } catch (err) {
        if (mountedRef.current) {
          setError(
            err instanceof Error ? err.message : "Failed to delete federation",
          );
        }
        throw err;
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [loadFederations],
  );

  useEffect(() => {
    loadFederations();
  }, [loadFederations]);

  return {
    federations,
    loading,
    error,
    createFederation,
    joinFederation,
    connectToFederation,
    deleteFederation,
    refreshFederations: loadFederations,
  };
}

export function useFederationClient(federationId: string | null) {
  const [client, setClient] = useState<FedimintClient | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadClient = useCallback(async () => {
    if (!federationId) {
      if (mountedRef.current) {
        setClient(null);
        setConnected(false);
        setError(null);
      }
      return;
    }

    try {
      if (mountedRef.current) {
        setLoading(true);
        setError(null);
      }

      const manager = getFederationManager();
      const fedClient = manager.getClient(federationId);

      if (fedClient && mountedRef.current) {
        setClient(fedClient);

        if (!fedClient.isConnected()) {
          await fedClient.connect();
        }

        const isConnected = fedClient.isConnected();
        setConnected(isConnected);

        if (isConnected) {
          try {
            const bal = await fedClient.getBalance();
            if (mountedRef.current) {
              setBalance(bal);
            }
          } catch (balanceErr) {
            console.warn("Failed to get balance:", balanceErr);
            if (mountedRef.current) {
              setBalance(0);
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to load federation client:", err);
      if (mountedRef.current) {
        setConnected(false);
        setError(err instanceof Error ? err.message : "Failed to load client");
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [federationId]);

  const refreshBalance = useCallback(async () => {
    if (client && connected && mountedRef.current) {
      try {
        const bal = await client.getBalance();
        if (mountedRef.current) {
          setBalance(bal);
        }
      } catch (err) {
        console.error("Failed to refresh balance:", err);
        if (mountedRef.current) {
          setError(
            err instanceof Error ? err.message : "Failed to refresh balance",
          );
        }
      }
    }
  }, [client, connected]);

  const createInvoice = useCallback(
    async (amount: number, description?: string) => {
      if (!client || !connected) {
        throw new Error("Client not connected");
      }

      try {
        return await client.createLightningInvoice(amount, description);
      } catch (err) {
        const error =
          err instanceof Error ? err.message : "Failed to create invoice";
        if (mountedRef.current) {
          setError(error);
        }
        throw new Error(error);
      }
    },
    [client, connected],
  );

  const payInvoice = useCallback(
    async (invoice: string) => {
      if (!client || !connected) {
        throw new Error("Client not connected");
      }

      try {
        const result = await client.payLightningInvoice(invoice);
        // Refresh balance after payment
        setTimeout(refreshBalance, 1000);
        return result;
      } catch (err) {
        const error =
          err instanceof Error ? err.message : "Failed to pay invoice";
        if (mountedRef.current) {
          setError(error);
        }
        throw new Error(error);
      }
    },
    [client, connected, refreshBalance],
  );

  const issueECash = useCallback(
    async (amount: number) => {
      if (!client || !connected) {
        throw new Error("Client not connected");
      }

      try {
        const result = await client.issueECash(amount);
        // Refresh balance after issuing
        setTimeout(refreshBalance, 1000);
        return result;
      } catch (err) {
        const error =
          err instanceof Error ? err.message : "Failed to issue e-cash";
        if (mountedRef.current) {
          setError(error);
        }
        throw new Error(error);
      }
    },
    [client, connected, refreshBalance],
  );

  useEffect(() => {
    loadClient();
  }, [loadClient]);

  return {
    client,
    balance,
    connected,
    loading,
    error,
    refreshBalance,
    reconnect: loadClient,
    createInvoice,
    payInvoice,
    issueECash,
  };
}
