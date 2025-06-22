/**
 * @fileoverview Tests for PhoenixDNodeStatus component
 * @description Unit tests for the PhoenixD Lightning node status monitoring component
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PhoenixDNodeStatus from '../PhoenixDNodeStatus';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock data
const mockHealthyStatus = {
  connected: true,
  status: 'healthy' as const,
  uptime: 2847392,
  nodeInfo: {
    nodeId: '03a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0',
    alias: 'Satnam Family Node',
    blockHeight: 800000,
    version: 'v0.7.0',
    network: 'mainnet',
  },
  balance: {
    balanceSat: 2500000,
    feeCreditSat: 50000,
    totalSat: 2550000,
  },
  channels: {
    total: 8,
    active: 8,
    totalLiquidity: 5000000,
  },
  automatedLiquidity: {
    active: true,
    lastUpdate: new Date(Date.now() - 300000).toISOString(),
  },
  familyBanking: {
    enabled: true,
    privacyEnabled: true,
    ready: true,
  },
  connectionHealth: {
    latency: 45,
    lastSuccessfulPing: new Date(Date.now() - 5000).toISOString(),
    failedAttempts: 0,
  },
  timestamp: new Date().toISOString(),
};

const mockUnhealthyStatus = {
  ...mockHealthyStatus,
  connected: false,
  status: 'unhealthy' as const,
  connectionHealth: {
    ...mockHealthyStatus.connectionHealth,
    failedAttempts: 3,
  },
};

describe('PhoenixDNodeStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves
    
    render(<PhoenixDNodeStatus />);
    
    expect(screen.getByText('Connecting to PhoenixD...')).toBeInTheDocument();
    expect(screen.getByText('Checking node status')).toBeInTheDocument();
  });

  it('renders healthy node status correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockHealthyStatus,
    });

    render(<PhoenixDNodeStatus />);

    await waitFor(() => {
      expect(screen.getByText('PhoenixD Lightning Node')).toBeInTheDocument();
    });

    // Check connection status
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Healthy')).toBeInTheDocument();

    // Check automated liquidity status
    expect(screen.getByText('Automated Liquidity Management')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();

    // Check uptime display
    expect(screen.getByText(/32d/)).toBeInTheDocument(); // Should show uptime in days

    // Check node information
    expect(screen.getByText('Satnam Family Node')).toBeInTheDocument();
    expect(screen.getByText('v0.7.0')).toBeInTheDocument();
    expect(screen.getByText('800,000')).toBeInTheDocument(); // Block height
  });

  it('renders unhealthy node status correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockUnhealthyStatus,
    });

    render(<PhoenixDNodeStatus />);

    await waitFor(() => {
      expect(screen.getByText('Disconnected')).toBeInTheDocument();
    });

    expect(screen.getByText('Unhealthy')).toBeInTheDocument();
  });

  it('handles API errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    render(<PhoenixDNodeStatus />);

    await waitFor(() => {
      expect(screen.getByText('Using demo data - API connection unavailable')).toBeInTheDocument();
    });

    // Should still show demo data
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Healthy')).toBeInTheDocument();
  });

  it('handles HTTP errors correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    render(<PhoenixDNodeStatus />);

    await waitFor(() => {
      expect(screen.getByText('PhoenixD Connection Failed')).toBeInTheDocument();
    });

    expect(screen.getByText(/HTTP 500/)).toBeInTheDocument();
  });

  it('refreshes data when refresh button is clicked', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockHealthyStatus,
    });

    render(<PhoenixDNodeStatus />);

    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    // Click refresh button
    const refreshButton = screen.getByTitle('Refresh Status');
    fireEvent.click(refreshButton);

    // Should make another API call
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('respects custom refresh interval', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockHealthyStatus,
    });

    const customInterval = 10000; // 10 seconds
    render(<PhoenixDNodeStatus refreshInterval={customInterval} />);

    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    // Fast-forward time by the custom interval
    vi.advanceTimersByTime(customInterval);

    // Should make another API call
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  it('hides details when showDetails is false', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockHealthyStatus,
    });

    render(<PhoenixDNodeStatus showDetails={false} />);

    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    // Detailed sections should not be visible
    expect(screen.queryByText('Node Information')).not.toBeInTheDocument();
    expect(screen.queryByText('Balance')).not.toBeInTheDocument();
    expect(screen.queryByText('Channels & Banking')).not.toBeInTheDocument();
  });

  it('shows details when showDetails is true (default)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockHealthyStatus,
    });

    render(<PhoenixDNodeStatus />);

    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    // Detailed sections should be visible
    expect(screen.getByText('Node Information')).toBeInTheDocument();
    expect(screen.getByText('Balance')).toBeInTheDocument();
    expect(screen.getByText('Channels & Banking')).toBeInTheDocument();
  });

  it('formats balance numbers correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockHealthyStatus,
    });

    render(<PhoenixDNodeStatus />);

    await waitFor(() => {
      expect(screen.getByText('2,500,000 sats')).toBeInTheDocument(); // Available balance
      expect(screen.getByText('50,000 sats')).toBeInTheDocument(); // Fee credit
      expect(screen.getByText('2,550,000 sats')).toBeInTheDocument(); // Total balance
    });
  });

  it('formats uptime correctly', async () => {
    const statusWithShortUptime = {
      ...mockHealthyStatus,
      uptime: 3665, // 1 hour, 1 minute, 5 seconds
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => statusWithShortUptime,
    });

    render(<PhoenixDNodeStatus />);

    await waitFor(() => {
      expect(screen.getByText('1h 1m')).toBeInTheDocument();
    });
  });

  it('calls API with correct endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockHealthyStatus,
    });

    render(<PhoenixDNodeStatus />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/phoenixd/status', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });
  });
});