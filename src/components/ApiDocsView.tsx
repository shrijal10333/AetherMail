import React, { useState } from 'react';
import { Key, Copy, Check, Terminal, Play, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const ApiDocsView: React.FC = () => {
  const { user, regenerateApiKey } = useAuth();
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeLang, setActiveLang] = useState<'curl' | 'js' | 'python'>('curl');

  // Interactive tester
  const [testEndpoint, setTestEndpoint] = useState('/api/v1/domains');
  const [testMethod, setTestMethod] = useState('GET');
  const [testResponse, setTestResponse] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const apiKey = user?.apiKey || 'aeth_guest_token_demo';

  const copyText = (text: string, type: 'key' | 'code') => {
    navigator.clipboard.writeText(text);
    if (type === 'key') {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } else {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const runTester = async () => {
    setIsTesting(true);
    setTestResponse(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (testEndpoint.startsWith('/api/v1/mailbox')) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const res = await fetch(testEndpoint, { method: testMethod, headers });
      const data = await res.json();
      setTestResponse(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setTestResponse(JSON.stringify({ error: err.message }, null, 2));
    } finally {
      setIsTesting(false);
    }
  };

  const curlExample = `curl -X POST https://aethermail.cx/api/v1/mailbox \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"prefix": "test_bot"}'`;

  const jsExample = `const res = await fetch('https://aethermail.cx/api/v1/mailbox', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ${apiKey}',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ prefix: 'test_bot' })
});
const { mailbox } = await res.json();
console.log('Address:', mailbox.address);`;

  const pythonExample = `import requests

res = requests.post(
    'https://aethermail.cx/api/v1/mailbox',
    headers={'Authorization': f'Bearer {apiKey}'},
    json={'prefix': 'test_bot'}
)
print(res.json()['mailbox']['address'])`;

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-12">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">
          Developer REST API
        </h1>
        <p className="text-sm text-zinc-400 max-w-md mx-auto">
          Automate temporary email generation and message verification in test suites and CI/CD pipelines.
        </p>
      </div>

      {/* API Key Panel */}
      <div className="rounded-xl border border-white/[0.06] bg-[#0E111A]/80 p-5 mb-8 text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-white mb-0.5">Your API Token</div>
            <p className="text-zinc-400">Include as Bearer header in authenticated requests.</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-zinc-900 border border-white/10 px-2.5 py-1.5 rounded-md font-mono text-zinc-200">
              <span className="truncate max-w-[200px]">{apiKey}</span>
              <button
                onClick={() => copyText(apiKey, 'key')}
                className="text-zinc-500 hover:text-white"
                title="Copy token"
              >
                {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            {user && (
              <button
                onClick={regenerateApiKey}
                className="p-1.5 rounded-md bg-zinc-900 border border-white/10 text-zinc-400 hover:text-white"
                title="Regenerate token"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Code Examples */}
      <div className="rounded-xl border border-white/[0.06] bg-[#0E111A]/80 overflow-hidden mb-8 text-xs">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] bg-zinc-900/40">
          <span className="text-zinc-300 font-medium">Create Mailbox Example</span>
          <div className="flex items-center gap-1 font-mono text-[11px]">
            <button
              onClick={() => setActiveLang('curl')}
              className={`px-2 py-0.5 rounded transition-colors ${
                activeLang === 'curl' ? 'bg-white text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
              }`}
            >
              cURL
            </button>
            <button
              onClick={() => setActiveLang('js')}
              className={`px-2 py-0.5 rounded transition-colors ${
                activeLang === 'js' ? 'bg-white text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Node.js
            </button>
            <button
              onClick={() => setActiveLang('python')}
              className={`px-2 py-0.5 rounded transition-colors ${
                activeLang === 'python' ? 'bg-white text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Python
            </button>
          </div>
        </div>

        <div className="p-4 bg-[#090A0F] relative">
          <pre className="font-mono text-zinc-300 leading-relaxed overflow-x-auto text-[11px]">
            {activeLang === 'curl' && curlExample}
            {activeLang === 'js' && jsExample}
            {activeLang === 'python' && pythonExample}
          </pre>

          <button
            onClick={() =>
              copyText(
                activeLang === 'curl' ? curlExample : activeLang === 'js' ? jsExample : pythonExample,
                'code'
              )
            }
            className="absolute top-3 right-3 p-1.5 rounded bg-zinc-800 text-zinc-400 hover:text-white text-[11px]"
            title="Copy code"
          >
            {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Endpoints Table */}
      <div className="rounded-xl border border-white/[0.06] bg-[#0E111A]/80 p-5 mb-8 text-xs">
        <h3 className="font-semibold text-white mb-3">API Endpoints</h3>
        <div className="divide-y divide-white/[0.04]">
          <div className="py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">GET</span>
              <span className="font-mono text-zinc-200">/api/v1/domains</span>
            </div>
            <span className="text-zinc-500">List available relay domains</span>
          </div>

          <div className="py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">POST</span>
              <span className="font-mono text-zinc-200">/api/v1/mailbox</span>
            </div>
            <span className="text-zinc-500">Create new mailbox</span>
          </div>

          <div className="py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">GET</span>
              <span className="font-mono text-zinc-200">/api/v1/mailbox/:id/messages</span>
            </div>
            <span className="text-zinc-500">List messages</span>
          </div>

          <div className="py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">GET</span>
              <span className="font-mono text-zinc-200">/api/v1/mailbox/:id/messages/:msgId</span>
            </div>
            <span className="text-zinc-500">Get message detail & body</span>
          </div>

          <div className="py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded">DELETE</span>
              <span className="font-mono text-zinc-200">/api/v1/mailbox/:id</span>
            </div>
            <span className="text-zinc-500">Delete mailbox</span>
          </div>
        </div>
      </div>

      {/* Interactive Tester */}
      <div className="rounded-xl border border-white/[0.06] bg-[#0E111A]/80 p-5 text-xs">
        <h3 className="font-semibold text-white mb-3">Live API Console</h3>

        <div className="flex items-center gap-2 mb-3">
          <select
            value={testMethod}
            onChange={e => setTestMethod(e.target.value)}
            className="bg-zinc-900 border border-white/10 rounded-md px-2.5 py-1.5 font-mono text-zinc-200 focus:outline-none"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>

          <input
            type="text"
            value={testEndpoint}
            onChange={e => setTestEndpoint(e.target.value)}
            className="flex-1 bg-zinc-900 border border-white/10 rounded-md px-3 py-1.5 font-mono text-zinc-200 focus:outline-none"
          />

          <button
            onClick={runTester}
            disabled={isTesting}
            className="px-3.5 py-1.5 rounded-md font-medium bg-white text-zinc-950 hover:bg-zinc-200 transition-colors cursor-pointer shrink-0"
          >
            {isTesting ? 'Sending...' : 'Send'}
          </button>
        </div>

        {testResponse && (
          <pre className="p-3 rounded bg-[#090A0F] border border-white/[0.04] font-mono text-[11px] text-zinc-300 overflow-x-auto max-h-56 leading-relaxed">
            {testResponse}
          </pre>
        )}
      </div>
    </div>
  );
};
