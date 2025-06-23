import { useEffect, useState } from "react";

interface ApiHealthStatus {
  isOnline: boolean;
  isLoading: boolean;
  error: string | null;
  lastChecked: Date | null;
}

export function useApiHealth() {
  const [status, setStatus] = useState<ApiHealthStatus>({
    isOnline: false,
    isLoading: true,
    error: null,
    lastChecked: null,
  });

  const checkApiHealth = async () => {
    try {
      setStatus((prev) => ({ ...prev, isLoading: true, error: null }));

      const response = await fetch("/api/health", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      if (response.ok) {
        const contentType = response.headers.get("content-type");

        // Check if response is actually JSON
        if (contentType && contentType.includes("application/json")) {
          const data = await response.json();
          setStatus({
            isOnline: data.success || false,
            isLoading: false,
            error: null,
            lastChecked: new Date(),
          });
        } else {
          // Response is not JSON - likely an API routing issue
          const text = await response.text();
          console.error(
            "API returned non-JSON response:",
            text.substring(0, 100)
          );
          throw new Error("API routing issue - received non-JSON response");
        }
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      // Check if it's a JSON parsing error
      if (error instanceof SyntaxError && error.message.includes("JSON")) {
        console.error(
          "API routing issue - JSON parsing failed:",
          error.message
        );
        setStatus({
          isOnline: false,
          isLoading: false,
          error: "API routing issue - check server configuration",
          lastChecked: new Date(),
        });
      } else {
        console.error("API health check failed:", error);
        setStatus({
          isOnline: false,
          isLoading: false,
          error: error instanceof Error ? error.message : "Unknown error",
          lastChecked: new Date(),
        });
      }
    }
  };

  useEffect(() => {
    // Initial health check
    checkApiHealth();

    // Set up periodic health checks every 30 seconds
    const interval = setInterval(checkApiHealth, 30000);

    return () => clearInterval(interval);
  }, []);

  return {
    ...status,
    refetch: checkApiHealth,
  };
}
