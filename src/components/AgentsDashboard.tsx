import React, { Suspense } from 'react';
import { AgentHealthDashboard } from './AgentHealthDashboard';
import { SpanOfControlMeter } from './SpanOfControlMeter';

const AgentSessionMonitor = React.lazy(() => import('./AgentSessionMonitor'));

export default function AgentsDashboard() {
    return (
        <div className="space-y-6">
            <SpanOfControlMeter />
            <AgentHealthDashboard />
            <Suspense fallback={<div>Loading session monitor...</div>}>
                <AgentSessionMonitor />
            </Suspense>
            {/* Existing agent list/grid */}
        </div>
    );
}