import { AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { useState } from 'react';

export default function ApiDebug() {
  const [testResults, setTestResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const testEndpoints = async () => {
    setIsLoading(true);
    const results = [];

    const endpoints = [
      { name: 'Health Check', url: '/api/health', method: 'GET' },
      { name: 'Test Endpoint', url: '/api/test', method: 'GET' },
      { name: 'Auth Session', url: '/api/auth/session', method: 'GET' },
    ];

    for (const endpoint of endpoints) {
      try {
        const startTime = Date.now();
        const response = await fetch(endpoint.url, {
          method: endpoint.method,
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const endTime = Date.now();
        const responseTime = endTime - startTime;

        let data;
        const contentType = response.headers.get('content-type') || '';
        let isJson = contentType.includes('application/json');

        if (isJson) {
          try {
            data = await response.json();
          } catch (jsonError) {
            data = { error: 'JSON parsing failed', details: jsonError.message };
            isJson = false;
          }
        } else {
          const text = await response.text();
          data = { 
            error: 'Non-JSON response', 
            contentType, 
            preview: text.substring(0, 200) + (text.length > 200 ? '...' : '')
          };
        }

        results.push({
          ...endpoint,
          status: response.status,
          ok: response.ok,
          responseTime,
          contentType,
          isJson,
          data,
        });
      } catch (error) {
        results.push({
          ...endpoint,
          status: 'ERROR',
          ok: false,
          responseTime: 0,
          contentType: 'N/A',
          isJson: false,
          data: { error: error.message },
        });
      }
    }

    setTestResults(results);
    setIsLoading(false);
  };

  return (
    <div className="fixed bottom-4 right-4 bg-white/10 backdrop-blur-sm rounded-lg p-4 max-w-md max-h-96 overflow-y-auto border border-white/20">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold">API Debug</h3>
        <button
          onClick={testEndpoints}
          disabled={isLoading}
          className="p-1 hover:bg-white/10 rounded transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 text-white ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {testResults.length === 0 && !isLoading && (
        <p className="text-white/70 text-sm">Click refresh to test API endpoints</p>
      )}

      {isLoading && (
        <p className="text-white/70 text-sm">Testing endpoints...</p>
      )}

      <div className="space-y-2">
        {testResults.map((result, index) => (
          <div key={index} className="bg-white/5 rounded p-2 text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="text-white font-medium">{result.name}</span>
              <div className="flex items-center space-x-1">
                {result.ok ? (
                  <CheckCircle className="h-3 w-3 text-green-400" />
                ) : (
                  <AlertCircle className="h-3 w-3 text-red-400" />
                )}
                <span className={`text-xs ${result.ok ? 'text-green-400' : 'text-red-400'}`}>
                  {result.status}
                </span>
              </div>
            </div>
            
            <div className="text-white/60 space-y-1">
              <div>URL: {result.url}</div>
              <div>Response Time: {result.responseTime}ms</div>
              <div>Content-Type: {result.contentType}</div>
              <div>Is JSON: {result.isJson ? 'Yes' : 'No'}</div>
              
              {result.data && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-white/80">Response Data</summary>
                  <pre className="mt-1 text-xs bg-black/20 p-1 rounded overflow-x-auto">
                    {JSON.stringify(result.data, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}