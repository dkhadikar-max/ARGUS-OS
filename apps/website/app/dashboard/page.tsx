'use client';

import { useAuth, SignOutButton } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { fetchWithAuth } from '@/lib/api';

interface QueueItem {
  decisionId: string;
  prospect: { name: string };
  verdict: string;
  reason: string;
}

interface QueueData {
  items: QueueItem[];
}

export default function Dashboard() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [queue, setQueue] = useState<QueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    async function loadQueue() {
      try {
        const token = await getToken();
        if (!token) {
          setError('No authentication token');
          setLoading(false);
          return;
        }
        const data = await fetchWithAuth('/api/v1/queue', token);
        setQueue(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadQueue();
  }, [isLoaded, isSignedIn, getToken]);

  if (!isLoaded) return <div className="p-8">Loading...</div>;
  if (!isSignedIn) return <div className="p-8">Please <a href="/sign-in" className="text-amber">sign in</a></div>;
  if (loading) return <div className="p-8">Loading queue...</div>;
  if (error) return <div className="p-8 text-red-400">Error: {error}</div>;

  return (
    <div className="min-h-screen bg-obsidian text-pearl p-8">
      <header className="flex justify-between items-center mb-8">
        <h1 className="font-mono text-2xl font-bold">ARGUS Dashboard</h1>
        <SignOutButton>
          <button className="font-mono text-xs bg-ash text-obsidian px-4 py-2">Sign Out</button>
        </SignOutButton>
      </header>

      <section>
        <h2 className="font-mono text-lg mb-4 text-amber">Today's Queue</h2>
        {queue && queue.items && queue.items.length > 0 ? (
          <ul className="space-y-4">
            {queue.items.map((item) => (
              <li key={item.decisionId} className="border border-ash p-4">
                <div className="flex justify-between">
                  <span className="font-mono">{item.prospect.name}</span>
                  <span className="font-mono text-xs px-2 py-1 bg-green-900 text-green-300">
                    {item.verdict}
                  </span>
                </div>
                <p className="text-sm text-ash mt-2">{item.reason}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ash">No prospects in queue.</p>
        )}
      </section>
    </div>
  );
}
