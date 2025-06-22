import { Shield } from "lucide-react";
import React from "react";
import { getStatusColor } from "../../lib/utils";
import { NodeStatus, SatnamFamilyMember } from "../types/shared";

interface NodeStatusSectionProps {
  nodeStatus: NodeStatus;
  familyMembers: SatnamFamilyMember[];
}

const NodeStatusSection: React.FC<NodeStatusSectionProps> = ({ nodeStatus, familyMembers }) => {
  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
      <h2 className="text-2xl font-bold text-white mb-6">Lightning Infrastructure Status</h2>
      
      <div className="grid md:grid-cols-4 gap-4">
        {/* PhoenixD Status */}
        <div className="bg-white/10 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white font-semibold">PhoenixD LSP</h3>
            <div className={`flex items-center space-x-1 ${getStatusColor(nodeStatus.phoenixd.connected ? "connected" : "disconnected")}`}>
              <div className={`w-2 h-2 rounded-full ${nodeStatus.phoenixd.connected ? "bg-green-400" : "bg-red-400"} ${nodeStatus.phoenixd.connected ? "animate-pulse" : ""}`}></div>
              <span className="text-sm">{nodeStatus.phoenixd.connected ? "Online" : "Offline"}</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-purple-200">Automated Liquidity</span>
            <span className={getStatusColor(nodeStatus.phoenixd.automatedLiquidity ? "active" : "inactive")}>
              {nodeStatus.phoenixd.automatedLiquidity ? "Active" : "Inactive"}
            </span>
          </div>
          {nodeStatus.phoenixd.version && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-purple-200">Version</span>
              <span className="text-white">{nodeStatus.phoenixd.version}</span>
            </div>
          )}
        </div>

        {/* Voltage Status */}
        <div className="bg-white/10 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white font-semibold">Voltage Node</h3>
            <div className={`flex items-center space-x-1 ${getStatusColor(nodeStatus.voltage.connected ? "connected" : "disconnected")}`}>
              <div className={`w-2 h-2 rounded-full ${nodeStatus.voltage.connected ? "bg-green-400" : "bg-red-400"} ${nodeStatus.voltage.connected ? "animate-pulse" : ""}`}></div>
              <span className="text-sm">{nodeStatus.voltage.connected ? "Connected" : "Disconnected"}</span>
            </div>
          </div>
          {nodeStatus.voltage.nodeId && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-purple-200">Node ID</span>
              <span className="text-white font-mono text-xs truncate max-w-[120px]">{nodeStatus.voltage.nodeId}</span>
            </div>
          )}
        </div>

        {/* LNProxy Status */}
        <div className="bg-white/10 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white font-semibold">LNProxy Privacy</h3>
            <div className={`flex items-center space-x-1 ${getStatusColor(nodeStatus.lnproxy.active ? "active" : "inactive")}`}>
              <Shield className="h-4 w-4" />
              <span className="text-sm">{nodeStatus.lnproxy.active ? "Protected" : "Disabled"}</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-purple-200">Privacy Level</span>
            <span className="text-white capitalize">{nodeStatus.lnproxy.privacyLevel}</span>
          </div>
        </div>

        {/* LNbits Status */}
        <div className="bg-white/10 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white font-semibold">LNbits Wallets</h3>
            <div className={`flex items-center space-x-1 ${getStatusColor(nodeStatus.lnbits.operational ? "operational" : "inactive")}`}>
              <div className={`w-2 h-2 rounded-full ${nodeStatus.lnbits.operational ? "bg-green-400" : "bg-red-400"} ${nodeStatus.lnbits.operational ? "animate-pulse" : ""}`}></div>
              <span className="text-sm">{nodeStatus.lnbits.operational ? "Operational" : "Offline"}</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-purple-200">Family Wallets</span>
            <span className="text-white">{familyMembers.length} active</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NodeStatusSection;