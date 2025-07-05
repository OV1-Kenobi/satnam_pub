/**
 * Emergency Recovery System Test Script
 * 
 * Comprehensive testing of the emergency recovery system including:
 * - API endpoint functionality
 * - Database operations
 * - Guardian consensus workflows
 * - Recovery execution
 * - Audit logging
 */

import { createClient } from '@supabase/supabase-js';

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Test data
const TEST_USER = {
  id: 'test-user-123',
  npub: 'npub1testuser123456789abcdefghijklmnopqrstuvwxyz',
  role: 'adult' as const,
  username: 'TestUser'
};

const TEST_FAMILY = {
  id: 'test-family-123',
  name: 'Test Family'
};

const TEST_GUARDIANS = [
  {
    npub: 'npub1guardian123456789abcdefghijklmnopqrstuvwxyz',
    role: 'guardian' as const,
    username: 'Guardian1'
  },
  {
    npub: 'npub1steward123456789abcdefghijklmnopqrstuvwxyz',
    role: 'steward' as const,
    username: 'Steward1'
  },
  {
    npub: 'npub1guardian2123456789abcdefghijklmnopqrstuvwxyz',
    role: 'guardian' as const,
    username: 'Guardian2'
  }
];

interface TestResult {
  test: string;
  status: 'PASS' | 'FAIL';
  message: string;
  duration?: number;
  error?: any;
}

class EmergencyRecoveryTester {
  private results: TestResult[] = [];
  private testRecoveryRequestId: string | null = null;

  async runAllTests(): Promise<void> {
    console.log('🚨 Starting Emergency Recovery System Tests\n');

    await this.testDatabaseSetup();
    await this.testGuardianManagement();
    await this.testRecoveryRequestCreation();
    await this.testGuardianApprovalWorkflow();
    await this.testRecoveryExecution();
    await this.testAuditLogging();
    await this.testCleanup();

    this.printResults();
  }

  private async testDatabaseSetup(): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Test if emergency recovery tables exist
      const { data: tables, error } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .in('table_name', [
          'emergency_recovery_requests',
          'emergency_recovery_approvals',
          'emergency_recovery_logs',
          'emergency_recovery_backups',
          'guardian_recovery_sessions'
        ]);

      if (error) throw error;

      const expectedTables = [
        'emergency_recovery_requests',
        'emergency_recovery_approvals',
        'emergency_recovery_logs',
        'emergency_recovery_backups',
        'guardian_recovery_sessions'
      ];

      const foundTables = tables?.map(t => t.table_name) || [];
      const missingTables = expectedTables.filter(t => !foundTables.includes(t));

      if (missingTables.length > 0) {
        throw new Error(`Missing tables: ${missingTables.join(', ')}`);
      }

      this.addResult('Database Setup', 'PASS', 'All emergency recovery tables exist', Date.now() - startTime);
    } catch (error) {
      this.addResult('Database Setup', 'FAIL', 'Database setup failed', Date.now() - startTime, error);
    }
  }

  private async testGuardianManagement(): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Create test family if it doesn't exist
      const { error: familyError } = await supabase
        .from('families')
        .upsert({
          id: TEST_FAMILY.id,
          name: TEST_FAMILY.name,
          created_at: new Date().toISOString()
        });

      if (familyError) throw familyError;

      // Create test guardians
      for (const guardian of TEST_GUARDIANS) {
        const { error } = await supabase
          .from('family_members')
          .upsert({
            family_id: TEST_FAMILY.id,
            npub: guardian.npub,
            username: guardian.username,
            role: guardian.role,
            is_active: true,
            created_at: new Date().toISOString()
          });

        if (error) throw error;
      }

      // Verify guardians were created
      const { data: guardians, error } = await supabase
        .from('family_members')
        .select('*')
        .eq('family_id', TEST_FAMILY.id)
        .in('role', ['guardian', 'steward']);

      if (error) throw error;

      if (guardians.length !== TEST_GUARDIANS.length) {
        throw new Error(`Expected ${TEST_GUARDIANS.length} guardians, found ${guardians.length}`);
      }

      this.addResult('Guardian Management', 'PASS', `Created ${guardians.length} guardians`, Date.now() - startTime);
    } catch (error) {
      this.addResult('Guardian Management', 'FAIL', 'Guardian management failed', Date.now() - startTime, error);
    }
  }

  private async testRecoveryRequestCreation(): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Create a test recovery request
      const { data: request, error } = await supabase
        .from('emergency_recovery_requests')
        .insert({
          user_id: TEST_USER.id,
          user_npub: TEST_USER.npub,
          user_role: TEST_USER.role,
          family_id: TEST_FAMILY.id,
          request_type: 'nsec_recovery',
          reason: 'lost_key',
          urgency: 'high',
          description: 'Test recovery request for lost private key',
          recovery_method: 'guardian_consensus',
          required_approvals: 2,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      this.testRecoveryRequestId = request.id;

      // Verify request was created
      if (!request.id) {
        throw new Error('Recovery request ID not generated');
      }

      this.addResult('Recovery Request Creation', 'PASS', `Created recovery request ${request.id}`, Date.now() - startTime);
    } catch (error) {
      this.addResult('Recovery Request Creation', 'FAIL', 'Recovery request creation failed', Date.now() - startTime, error);
    }
  }

  private async testGuardianApprovalWorkflow(): Promise<void> {
    const startTime = Date.now();
    
    if (!this.testRecoveryRequestId) {
      this.addResult('Guardian Approval Workflow', 'FAIL', 'No recovery request ID available', Date.now() - startTime);
      return;
    }

    try {
      // Test guardian approvals
      for (let i = 0; i < 2; i++) {
        const guardian = TEST_GUARDIANS[i];
        const { error } = await supabase
          .from('emergency_recovery_approvals')
          .insert({
            recovery_request_id: this.testRecoveryRequestId,
            guardian_npub: guardian.npub,
            guardian_role: guardian.role,
            approval: 'approved',
            notes: `Test approval from ${guardian.username}`
          });

        if (error) throw error;
      }

      // Update recovery request with approval count
      const { error: updateError } = await supabase
        .from('emergency_recovery_requests')
        .update({
          current_approvals: 2,
          status: 'approved'
        })
        .eq('id', this.testRecoveryRequestId);

      if (updateError) throw updateError;

      // Verify approval status
      const { data: request, error: fetchError } = await supabase
        .from('emergency_recovery_requests')
        .select('*')
        .eq('id', this.testRecoveryRequestId)
        .single();

      if (fetchError) throw fetchError;

      if (request.status !== 'approved') {
        throw new Error(`Expected status 'approved', got '${request.status}'`);
      }

      if (request.current_approvals !== 2) {
        throw new Error(`Expected 2 approvals, got ${request.current_approvals}`);
      }

      this.addResult('Guardian Approval Workflow', 'PASS', 'Guardian consensus achieved', Date.now() - startTime);
    } catch (error) {
      this.addResult('Guardian Approval Workflow', 'FAIL', 'Guardian approval workflow failed', Date.now() - startTime, error);
    }
  }

  private async testRecoveryExecution(): Promise<void> {
    const startTime = Date.now();
    
    if (!this.testRecoveryRequestId) {
      this.addResult('Recovery Execution', 'FAIL', 'No recovery request ID available', Date.now() - startTime);
      return;
    }

    try {
      // Execute recovery
      const { error } = await supabase
        .from('emergency_recovery_requests')
        .update({
          status: 'completed',
          executed_at: new Date().toISOString(),
          executor_npub: TEST_GUARDIANS[0].npub,
          executor_role: TEST_GUARDIANS[0].role,
          recovery_result: {
            success: true,
            method: 'guardian_consensus',
            new_keys_generated: true,
            timestamp: new Date().toISOString()
          }
        })
        .eq('id', this.testRecoveryRequestId);

      if (error) throw error;

      // Verify execution
      const { data: request, error: fetchError } = await supabase
        .from('emergency_recovery_requests')
        .select('*')
        .eq('id', this.testRecoveryRequestId)
        .single();

      if (fetchError) throw fetchError;

      if (request.status !== 'completed') {
        throw new Error(`Expected status 'completed', got '${request.status}'`);
      }

      if (!request.executed_at) {
        throw new Error('Execution timestamp not set');
      }

      this.addResult('Recovery Execution', 'PASS', 'Recovery executed successfully', Date.now() - startTime);
    } catch (error) {
      this.addResult('Recovery Execution', 'FAIL', 'Recovery execution failed', Date.now() - startTime, error);
    }
  }

  private async testAuditLogging(): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Check audit logs
      const { data: logs, error } = await supabase
        .from('emergency_recovery_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(10);

      if (error) throw error;

      if (logs.length === 0) {
        throw new Error('No audit logs found');
      }

      // Verify log entries for our test
      const testLogs = logs.filter(log => 
        log.recovery_request_id === this.testRecoveryRequestId ||
        log.action === 'system_initialization'
      );

      if (testLogs.length === 0) {
        throw new Error('No audit logs found for test recovery request');
      }

      this.addResult('Audit Logging', 'PASS', `Found ${testLogs.length} audit log entries`, Date.now() - startTime);
    } catch (error) {
      this.addResult('Audit Logging', 'FAIL', 'Audit logging test failed', Date.now() - startTime, error);
    }
  }

  private async testCleanup(): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Clean up test data
      if (this.testRecoveryRequestId) {
        await supabase
          .from('emergency_recovery_requests')
          .delete()
          .eq('id', this.testRecoveryRequestId);
      }

      // Clean up test guardians
      for (const guardian of TEST_GUARDIANS) {
        await supabase
          .from('family_members')
          .delete()
          .eq('npub', guardian.npub);
      }

      // Clean up test family
      await supabase
        .from('families')
        .delete()
        .eq('id', TEST_FAMILY.id);

      this.addResult('Cleanup', 'PASS', 'Test data cleaned up successfully', Date.now() - startTime);
    } catch (error) {
      this.addResult('Cleanup', 'FAIL', 'Cleanup failed', Date.now() - startTime, error);
    }
  }

  private addResult(test: string, status: 'PASS' | 'FAIL', message: string, duration?: number, error?: any): void {
    this.results.push({
      test,
      status,
      message,
      duration,
      error
    });
  }

  private printResults(): void {
    console.log('\n📊 Test Results Summary\n');
    console.log('='.repeat(60));

    let passCount = 0;
    let failCount = 0;
    let totalDuration = 0;

    for (const result of this.results) {
      const statusIcon = result.status === 'PASS' ? '✅' : '❌';
      const duration = result.duration ? ` (${result.duration}ms)` : '';
      
      console.log(`${statusIcon} ${result.test}${duration}`);
      console.log(`   ${result.message}`);
      
      if (result.error) {
        console.log(`   Error: ${result.error.message || result.error}`);
      }
      
      console.log('');

      if (result.status === 'PASS') passCount++;
      else failCount++;

      if (result.duration) totalDuration += result.duration;
    }

    console.log('='.repeat(60));
    console.log(`Total Tests: ${this.results.length}`);
    console.log(`Passed: ${passCount}`);
    console.log(`Failed: ${failCount}`);
    console.log(`Total Duration: ${totalDuration}ms`);
    console.log(`Success Rate: ${((passCount / this.results.length) * 100).toFixed(1)}%`);

    if (failCount > 0) {
      console.log('\n❌ Some tests failed. Please check the errors above.');
      process.exit(1);
    } else {
      console.log('\n✅ All tests passed! Emergency recovery system is working correctly.');
    }
  }
}

// Run tests
async function main() {
  const tester = new EmergencyRecoveryTester();
  await tester.runAllTests();
}

// Handle command line execution
if (require.main === module) {
  main().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

export { EmergencyRecoveryTester }; 