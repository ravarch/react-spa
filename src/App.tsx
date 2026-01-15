import { useState, useEffect } from 'react';

function App() {
  const [message, setMessage] = useState<string>('Loading...');
  const [uuid, setUuid] = useState<string>('');

  useEffect(() => {
    // Fetch initial message from API
    fetch('/api/message')
      .then((res) => res.text())
      .then(setMessage)
      .catch((err) => setMessage('Error loading message'));
  }, []);

  const fetchRandom = () => {
    fetch('/api/random')
      .then((res) => res.text())
      .then(setUuid)
      .catch((err) => setUuid('Error fetching UUID'));
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 text-gray-800 font-sans">
      <div className="p-8 bg-white rounded-xl shadow-lg space-y-6 text-center max-w-md w-full">
        <h1 className="text-3xl font-bold text-blue-600">{message}</h1>
        <p className="text-gray-600">
          This is a complete React SPA powered by Cloudflare Workers.
        </p>
        
        <div className="pt-4 border-t border-gray-200">
          <button
            onClick={fetchRandom}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Generate UUID
          </button>
          
          {uuid && (
            <div className="mt-4 p-3 bg-gray-50 rounded border border-gray-200 font-mono text-sm break-all">
              {uuid}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
