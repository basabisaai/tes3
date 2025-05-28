import { useEffect, useState } from 'react';
import supabase from './supabaseClient';

export default function ThreadList({ onSelectThread, userId }) {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);

  // ✅ Fetch threads when userId changes
  useEffect(() => {
    const fetchThreads = async () => {
      if (!userId) {
        setThreads([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('threads')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to fetch threads:', error.message);
        alert("Failed to fetch threads: " + error.message);
        setLoading(false);
        return;
      }

      setThreads(data || []);
      setLoading(false);
      
      // ✅ Log threads to confirm data is set
      console.log("Threads fetched:", data);
    };

    fetchThreads();

    // ✅ Optional: Real-time updates
    const channel = supabase
      .channel('custom-threads-channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'threads',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setThreads((prev) => [payload.new, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // ✅ Create new thread
  const createNewThread = async () => {
    if (!userId) {
      alert("Please log in first!");
      return;
    }

    const { data, error } = await supabase
      .from('threads')
      .insert({ 
        title: 'New Thread', 
        user_id: userId 
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create thread:', error.message);
      alert("Failed to create thread: " + error.message);
    } else {
      setThreads([data, ...threads]);
      onSelectThread(data);
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-2 text-gray-700">Threads</h2>
      <button 
        onClick={createNewThread}
        className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-lg mb-4 transition duration-200"
      >
        + New Thread
      </button>

      {loading ? (
        <p className="text-sm text-gray-400">Loading threads...</p>
      ) : threads.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No threads yet. Create one!</p>
      ) : (
        <ul className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
          {threads.map((thread) => (
            <li 
              key={thread.id}  // ✅ Must use thread.id for key
              onClick={() => onSelectThread(thread)}
              className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition duration-150"
            >
              {thread.title || 'Untitled Thread'}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}