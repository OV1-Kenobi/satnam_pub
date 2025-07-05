/**
 * Emergency Recovery Test Component
 * 
 * Simulates lost key scenarios and tests the emergency recovery workflow
 * for all RBAC levels (Guardian, Steward, Adult, Offspring).
 * 
 * Tests multi-sig, password, and Shamir Secret Sharing recovery protocols.
 */

import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Eye,
  EyeOff,
  FileText,
  Key,
  Lock,
  Shield,
  Users,
  X,
  Zap,
  RefreshCw,
  UserCheck,
  AlertCircle,
  Info
} from 'lucide-react';
import { EmergencyRecoverySystem, EmergencyRecoveryRequest, GuardianApproval } from '../lib/emergency-recovery';
import { FederationRole } from '../types/auth';

interface TestScenario {
  id: string;
  name: string;
  description: string;
  userRole: FederationRole;
  requestType: EmergencyRecoveryRequest['requestType'];
  reason: EmergencyRecoveryRequest['reason'];
  urgency: EmergencyRecoveryRequest['urgency'];
  recoveryMethod: EmergencyRecoveryRequest['recoveryMethod'];
  expectedOutcome: string;
  complexity: 'low' | 'medium' | 'high';
}

interface TestResult {
  scenarioId: string;
  success: boolean;
  duration: number;
  steps: string[];
  errors: string[];
  guardianApprovals: GuardianApproval[];
  finalStatus: string;
}

const TEST_SCENARIOS: TestScenario[] = [
  {
    id: 'lost-key-offspring',
    name: 'Lost Key - Offspring',
    description: 'Offspring loses their nsec key and needs recovery',
    userRole: 'offspring',
    requestType: 'nsec_recovery',
    reason: 'lost_key',
    urgency: 'high',
    recoveryMethod: 'guardian_consensus',
    expectedOutcome: 'Requires adult/steward/guardian approval',
    complexity: 'medium'
  },
  {
    id: 'emergency-liquidity-adult',
    name: 'Emergency Liquidity - Adult',
    description: 'Adult needs emergency funds for urgent situation',
    userRole: 'adult',
    requestType: 'emergency_liquidity',
    reason: 'emergency_funds',
    urgency: 'critical',
    recoveryMethod: 'guardian_consensus',
    expectedOutcome: 'Requires steward/guardian approval',
    complexity: 'high'
  },
  {
    id: 'compromised-key-steward',
    name: 'Compromised Key - Steward',
    description: 'Steward suspects their key is compromised',
    userRole: 'steward',
    requestType: 'nsec_recovery',
    reason: 'compromised_key',
    urgency: 'critical',
    recoveryMethod: 'multisig',
    expectedOutcome: 'Can self-approve with guardian oversight',
    complexity: 'high'
  },
  {
    id: 'account-lockout-guardian',
    name: 'Account Lockout - Guardian',
    description: 'Guardian is locked out of their account',
    userRole: 'guardian',
    requestType: 'account_restoration',
    reason: 'account_lockout',
    urgency: 'medium',
    recoveryMethod: 'password',
    expectedOutcome: 'Can self-approve recovery',
    complexity: 'low'
  },
  {
    id: 'ecash-recovery-offspring',
    name: 'eCash Recovery - Offspring',
    description: 'Offspring needs to recover lost eCash tokens',
    userRole: 'offspring',
    requestType: 'ecash_recovery',
    reason: 'lost_key',
    urgency: 'medium',
    recoveryMethod: 'shamir',
    expectedOutcome: 'Requires guardian consensus with Shamir shares',
    complexity: 'high'
  }
];

const MOCK_GUARDIANS = [
  { npub: 'npub1guardian1', role: 'guardian' as FederationRole, name: 'Guardian Alpha' },
  { npub: 'npub1steward1', role: 'steward' as FederationRole, name: 'Steward Beta' },
  { npub: 'npub1steward2', role: 'steward' as FederationRole, name: 'Steward Gamma' }
];

export function EmergencyRecoveryTest({ onBack }: { onBack?: () => void }) {
  const [selectedScenario, setSelectedScenario] = useState<TestScenario | null>(null);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isRunningTest, setIsRunningTest] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [showDetails, setShowDetails] = useState(false);
  const [mockUser, setMockUser] = useState({
    id: 'test-user-123',
    npub: 'npub1testuser',
    role: 'offspring' as FederationRole
  });

  // Simulate recovery request
  const simulateRecoveryRequest = async (scenario: TestScenario): Promise<TestResult> => {
    const startTime = Date.now();
    const steps: string[] = [];
    const errors: string[] = [];
    const guardianApprovals: GuardianApproval[] = [];

    try {
      steps.push(`Starting recovery simulation for: ${scenario.name}`);
      setCurrentStep(`Initializing ${scenario.name}...`);

      // Step 1: Initiate recovery request
      steps.push('1. Initiating recovery request...');
      setCurrentStep('Initiating recovery request...');
      
      const recoveryResult = await EmergencyRecoverySystem.initiateRecovery({
        userId: mockUser.id,
        userNpub: mockUser.npub,
        userRole: scenario.userRole,
        requestType: scenario.requestType,
        reason: scenario.reason,
        urgency: scenario.urgency,
        description: `Test scenario: ${scenario.description}`,
        requestedAmount: scenario.requestType === 'emergency_liquidity' ? 50000 : undefined,
        recoveryMethod: scenario.recoveryMethod
      });

      if (!recoveryResult.success) {
        errors.push(`Failed to initiate recovery: ${recoveryResult.error}`);
        return {
          scenarioId: scenario.id,
          success: false,
          duration: Date.now() - startTime,
          steps,
          errors,
          guardianApprovals,
          finalStatus: 'failed'
        };
      }

      steps.push(`2. Recovery request created: ${recoveryResult.data?.requestId}`);
      setCurrentStep('Simulating guardian approvals...');

      // Step 2: Simulate guardian approvals
      const requiredApprovals = recoveryResult.data?.requiredApprovals || 2;
      let approvedCount = 0;
      let rejectedCount = 0;

      for (const guardian of MOCK_GUARDIANS) {
        if (approvedCount >= requiredApprovals) break;

        steps.push(`3. Guardian ${guardian.name} reviewing request...`);
        setCurrentStep(`${guardian.name} reviewing request...`);

        // Simulate approval decision based on scenario
        const shouldApprove = shouldGuardianApprove(guardian, scenario);
        const approval: 'approved' | 'rejected' | 'abstained' = shouldApprove ? 'approved' : 'rejected';

        const approvalResult = await EmergencyRecoverySystem.guardianApproval({
          recoveryRequestId: recoveryResult.data!.requestId,
          guardianNpub: guardian.npub,
          guardianRole: guardian.role,
          approval,
          reason: shouldApprove ? 'Approved for testing' : 'Rejected for testing',
          signature: `mock_signature_${guardian.npub}_${Date.now()}`
        });

        if (approvalResult.success) {
          if (approval === 'approved') {
            approvedCount++;
            steps.push(`4. Guardian ${guardian.name} approved`);
          } else {
            rejectedCount++;
            steps.push(`4. Guardian ${guardian.name} rejected`);
          }

          guardianApprovals.push({
            id: `approval_${guardian.npub}`,
            recoveryRequestId: recoveryResult.data!.requestId,
            guardianNpub: guardian.npub,
            guardianRole: guardian.role,
            approval,
            reason: shouldApprove ? 'Approved for testing' : 'Rejected for testing',
            signature: `mock_signature_${guardian.npub}_${Date.now()}`,
            timestamp: new Date()
          });
        } else {
          errors.push(`Guardian ${guardian.name} approval failed: ${approvalResult.error}`);
        }

        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Step 3: Execute recovery if approved
      if (approvedCount >= requiredApprovals) {
        steps.push('5. Consensus reached, executing recovery...');
        setCurrentStep('Executing recovery...');

        const executionResult = await EmergencyRecoverySystem.executeRecovery({
          recoveryRequestId: recoveryResult.data!.requestId,
          executorNpub: MOCK_GUARDIANS[0].npub,
          executorRole: MOCK_GUARDIANS[0].role
        });

        if (executionResult.success) {
          steps.push('6. Recovery executed successfully');
          setCurrentStep('Recovery completed successfully');
        } else {
          errors.push(`Recovery execution failed: ${executionResult.error}`);
        }
      } else {
        steps.push('5. Insufficient approvals, recovery rejected');
        setCurrentStep('Recovery rejected due to insufficient approvals');
      }

      const duration = Date.now() - startTime;
      const success = approvedCount >= requiredApprovals && errors.length === 0;

      return {
        scenarioId: scenario.id,
        success,
        duration,
        steps,
        errors,
        guardianApprovals,
        finalStatus: success ? 'completed' : 'rejected'
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      errors.push(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      return {
        scenarioId: scenario.id,
        success: false,
        duration,
        steps,
        errors,
        guardianApprovals,
        finalStatus: 'failed'
      };
    }
  };

  // Determine if guardian should approve based on scenario
  const shouldGuardianApprove = (guardian: any, scenario: TestScenario): boolean => {
    // Guardians are more likely to approve critical requests
    if (scenario.urgency === 'critical') return true;
    
    // Stewards are more likely to approve steward requests
    if (guardian.role === 'steward' && scenario.userRole === 'steward') return true;
    
    // Guardians are more likely to approve guardian requests
    if (guardian.role === 'guardian' && scenario.userRole === 'guardian') return true;
    
    // Higher approval rate for high urgency
    if (scenario.urgency === 'high') return Math.random() > 0.3;
    
    // Medium approval rate for medium urgency
    if (scenario.urgency === 'medium') return Math.random() > 0.5;
    
    // Lower approval rate for low urgency
    return Math.random() > 0.7;
  };

  // Run single test scenario
  const runSingleTest = async (scenario: TestScenario) => {
    setIsRunningTest(true);
    setSelectedScenario(scenario);
    setCurrentStep('Starting test...');

    try {
      const result = await simulateRecoveryRequest(scenario);
      setTestResults(prev => [...prev, result]);
    } catch (error) {
      console.error('Test failed:', error);
    } finally {
      setIsRunningTest(false);
      setCurrentStep('');
    }
  };

  // Run all test scenarios
  const runAllTests = async () => {
    setIsRunningTest(true);
    setTestResults([]);

    for (const scenario of TEST_SCENARIOS) {
      setSelectedScenario(scenario);
      setCurrentStep(`Running ${scenario.name}...`);

      try {
        const result = await simulateRecoveryRequest(scenario);
        setTestResults(prev => [...prev, result]);
        
        // Brief pause between tests
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Test ${scenario.name} failed:`, error);
      }
    }

    setIsRunningTest(false);
    setCurrentStep('');
    setSelectedScenario(null);
  };

  // Get test result for a scenario
  const getTestResult = (scenarioId: string): TestResult | undefined => {
    return testResults.find(result => result.scenarioId === scenarioId);
  };

  // Get success rate
  const getSuccessRate = (): number => {
    if (testResults.length === 0) return 0;
    const successful = testResults.filter(result => result.success).length;
    return (successful / testResults.length) * 100;
  };

  return (
    <div className="emergency-recovery-test max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center space-x-4 mb-4">
          <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Emergency Recovery Test Suite</h1>
            <p className="text-gray-600">Simulate lost key scenarios and test recovery workflows</p>
          </div>
        </div>
        {onBack && (
          <button
            onClick={onBack}
            className="mb-4 px-4 py-2 bg-purple-700 text-white rounded-lg hover:bg-purple-800 transition-colors"
          >
            ← Back to Home
          </button>
        )}

        {/* Test Controls */}
        <div className="flex items-center space-x-4 mb-6">
          <button
            onClick={runAllTests}
            disabled={isRunningTest}
            className="px-6 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
          >
            {isRunningTest ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Running Tests...</span>
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                <span>Run All Tests</span>
              </>
            )}
          </button>

          <button
            onClick={() => setShowDetails(!showDetails)}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center space-x-2"
          >
            {showDetails ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            <span>{showDetails ? 'Hide' : 'Show'} Details</span>
          </button>

          {testResults.length > 0 && (
            <div className="flex items-center space-x-2 text-sm">
              <span className="text-gray-600">Success Rate:</span>
              <span className={`font-semibold ${getSuccessRate() >= 80 ? 'text-green-600' : getSuccessRate() >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                {getSuccessRate().toFixed(1)}%
              </span>
              <span className="text-gray-500">({testResults.length} tests)</span>
            </div>
          )}
        </div>

        {/* Current Test Status */}
        {isRunningTest && currentStep && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center space-x-2">
              <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
              <span className="text-blue-800 font-medium">{currentStep}</span>
            </div>
          </div>
        )}
      </div>

      {/* Test Scenarios Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {TEST_SCENARIOS.map((scenario) => {
          const result = getTestResult(scenario.id);
          const isRunning = isRunningTest && selectedScenario?.id === scenario.id;

          return (
            <div
              key={scenario.id}
              className={`bg-white rounded-xl border-2 p-6 transition-all duration-300 ${
                result?.success
                  ? 'border-green-200 bg-green-50'
                  : result?.success === false
                  ? 'border-red-200 bg-red-50'
                  : isRunning
                  ? 'border-blue-200 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {/* Scenario Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 mb-1">{scenario.name}</h3>
                  <p className="text-sm text-gray-600 mb-2">{scenario.description}</p>
                  
                  {/* Role Badge */}
                  <div className="flex items-center space-x-2 mb-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      scenario.userRole === 'guardian' ? 'bg-purple-100 text-purple-800' :
                      scenario.userRole === 'steward' ? 'bg-blue-100 text-blue-800' :
                      scenario.userRole === 'adult' ? 'bg-green-100 text-green-800' :
                      'bg-orange-100 text-orange-800'
                    }`}>
                      {scenario.userRole}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      scenario.urgency === 'critical' ? 'bg-red-100 text-red-800' :
                      scenario.urgency === 'high' ? 'bg-orange-100 text-orange-800' :
                      scenario.urgency === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {scenario.urgency}
                    </span>
                  </div>
                </div>

                {/* Status Icon */}
                <div className="ml-4">
                  {result?.success ? (
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  ) : result?.success === false ? (
                    <X className="h-6 w-6 text-red-600" />
                  ) : isRunning ? (
                    <RefreshCw className="h-6 w-6 text-blue-600 animate-spin" />
                  ) : (
                    <Clock className="h-6 w-6 text-gray-400" />
                  )}
                </div>
              </div>

              {/* Scenario Details */}
              <div className="space-y-2 mb-4">
                <div className="flex items-center space-x-2 text-sm">
                  <FileText className="h-4 w-4 text-gray-500" />
                  <span className="text-gray-600">Type: {scenario.requestType}</span>
                </div>
                <div className="flex items-center space-x-2 text-sm">
                  <Key className="h-4 w-4 text-gray-500" />
                  <span className="text-gray-600">Method: {scenario.recoveryMethod}</span>
                </div>
                <div className="flex items-center space-x-2 text-sm">
                  <Shield className="h-4 w-4 text-gray-500" />
                  <span className="text-gray-600">Complexity: {scenario.complexity}</span>
                </div>
              </div>

              {/* Expected Outcome */}
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-700">
                  <strong>Expected:</strong> {scenario.expectedOutcome}
                </p>
              </div>

              {/* Test Result Summary */}
              {result && (
                <div className="mb-4 p-3 bg-white border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Result:</span>
                    <span className={`text-sm font-medium ${
                      result.success ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {result.finalStatus.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    Duration: {result.duration}ms | 
                    Approvals: {result.guardianApprovals.filter(a => a.approval === 'approved').length}/
                    {result.guardianApprovals.length}
                  </div>
                  {result.errors.length > 0 && (
                    <div className="mt-2 text-xs text-red-600">
                      Errors: {result.errors.length}
                    </div>
                  )}
                </div>
              )}

              {/* Action Button */}
              <button
                onClick={() => runSingleTest(scenario)}
                disabled={isRunningTest}
                className={`w-full px-4 py-2 rounded-lg font-medium transition-colors ${
                  result?.success
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : result?.success === false
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isRunning ? 'Running...' : result ? 'Re-run Test' : 'Run Test'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Detailed Results */}
      {showDetails && testResults.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Detailed Test Results</h2>
          
          <div className="space-y-6">
            {testResults.map((result, index) => {
              const scenario = TEST_SCENARIOS.find(s => s.id === result.scenarioId);
              
              return (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900">{scenario?.name}</h3>
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {result.finalStatus}
                      </span>
                      <span className="text-sm text-gray-500">{result.duration}ms</span>
                    </div>
                  </div>

                  {/* Steps */}
                  <div className="mb-3">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Steps:</h4>
                    <div className="space-y-1">
                      {result.steps.map((step, stepIndex) => (
                        <div key={stepIndex} className="text-sm text-gray-600 flex items-start space-x-2">
                          <span className="text-gray-400">•</span>
                          <span>{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Guardian Approvals */}
                  {result.guardianApprovals.length > 0 && (
                    <div className="mb-3">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Guardian Approvals:</h4>
                      <div className="space-y-1">
                        {result.guardianApprovals.map((approval, approvalIndex) => (
                          <div key={approvalIndex} className="text-sm flex items-center space-x-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              approval.approval === 'approved' ? 'bg-green-100 text-green-800' :
                              approval.approval === 'rejected' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {approval.approval}
                            </span>
                            <span className="text-gray-600">{approval.guardianNpub.substring(0, 20)}...</span>
                            <span className="text-gray-500">({approval.guardianRole})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Errors */}
                  {result.errors.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-red-700 mb-2">Errors:</h4>
                      <div className="space-y-1">
                        {result.errors.map((error, errorIndex) => (
                          <div key={errorIndex} className="text-sm text-red-600 flex items-start space-x-2">
                            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <span>{error}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Mock Guardians Info */}
      <div className="mt-8 bg-gray-50 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Mock Guardian Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {MOCK_GUARDIANS.map((guardian, index) => (
            <div key={index} className="bg-white rounded-lg p-4 border border-gray-200">
              <div className="flex items-center space-x-2 mb-2">
                <UserCheck className="h-4 w-4 text-blue-600" />
                <span className="font-medium text-gray-900">{guardian.name}</span>
              </div>
              <div className="text-sm text-gray-600 mb-1">{guardian.npub}</div>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                guardian.role === 'guardian' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
              }`}>
                {guardian.role}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Recovery System Info */}
      <div className="mt-8 bg-blue-50 rounded-xl p-6">
        <div className="flex items-center space-x-2 mb-4">
          <Info className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-blue-900">Emergency Recovery System</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-blue-800">
          <div>
            <h4 className="font-medium mb-2">Supported Recovery Methods:</h4>
            <ul className="space-y-1">
              <li>• Password-based recovery</li>
              <li>• Multi-signature consensus</li>
              <li>• Shamir Secret Sharing (SSS)</li>
              <li>• Guardian consensus approval</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium mb-2">RBAC Integration:</h4>
            <ul className="space-y-1">
              <li>• Guardian: Full recovery authority</li>
              <li>• Steward: High-level recovery access</li>
              <li>• Adult: Limited recovery options</li>
              <li>• Offspring: Guardian-supervised recovery</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EmergencyRecoveryTest; 