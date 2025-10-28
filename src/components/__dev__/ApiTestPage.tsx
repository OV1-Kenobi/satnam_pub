import { useState } from 'react';
import { FamilyApiService } from '../../services/familyApi';
import { IndividualApiService } from '../../services/individualApi';

interface ApiTestResult {
  name: string;
  success: boolean;
  duration: number;
  responseTime: number;
  result?: unknown;
  error?: string;
}

export default function ApiTestPage() {
  const [results, setResults] = useState<ApiTestResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const runApiTests = async () => {
    setIsLoading(true);
    const testResults = [];

    // Test API endpoints
    const tests = [
      {
        name: 'System Health',
        test: () => FamilyApiService.getSystemHealth(),
      },
      {
        name: 'API Test',
        test: () => FamilyApiService.testApi(),
      },
      {
        name: 'Lightning Status',
        test: () => FamilyApiService.getLightningStatus(),
      },
      {
        name: 'Fedimint Status',
        test: () => FamilyApiService.getFedimintStatus(),
      },
      {
        name: 'PhoenixD Status',
        test: () => FamilyApiService.getPhoenixdStatus(),
      },
      {
        name: 'Family Members',
        test: () => FamilyApiService.getFamilyMembers(),
      },
      {
        name: 'Individual Wallet',
        test: () => IndividualApiService.getWalletData('test-member'),
      },
    ];

    for (const { name, test } of tests) {
      try {
        const startTime = Date.now();
        const result = await test();
        const endTime = Date.now();

        testResults.push({
          name,
          success: true,
          duration: endTime - startTime,
          responseTime: endTime - startTime,
          result,
        });
      } catch (error) {
        testResults.push({
          name,
          success: false,
          duration: 0,
          responseTime: 0,
          result: null,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    setResults(testResults);
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-8 border border-white/20">
          <h1 className="text-3xl font-bold text-white mb-6">API Test Dashboard</h1>

          <button
            onClick={runApiTests}
            disabled={isLoading}
            className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold px-6 py-3 rounded-lg transition-colors disabled:opacity-50 mb-6"
          >
            {isLoading ? 'Running Tests...' : 'Run API Tests'}
          </button>

          {results.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-white mb-4">Test Results</h2>

              {results.map((result, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg border ${result.success
                    ? 'bg-green-900/20 border-green-500/30'
                    : 'bg-red-900/20 border-red-500/30'
                    }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-medium text-white">{result.name}</h3>
                    <div className="flex items-center space-x-2">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${result.success
                          ? 'bg-green-500 text-white'
                          : 'bg-red-500 text-white'
                          }`}
                      >
                        {result.success ? 'SUCCESS' : 'FAILED'}
                      </span>
                      {result.success && (
                        <span className="text-white/70 text-sm">
                          {result.responseTime}ms
                        </span>
                      )}
                    </div>
                  </div>

                  {result.error && (
                    <div className="text-red-300 text-sm mb-2">
                      Error: {result.error}
                    </div>
                  )}

                  {result.result != null && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-white/80 text-sm">
                        View Response Data
                      </summary>
                      <pre className="mt-2 text-xs bg-black/20 p-3 rounded overflow-x-auto text-white/90">
                        {JSON.stringify(result.result as any, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}