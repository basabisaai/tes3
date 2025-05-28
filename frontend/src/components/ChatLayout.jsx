// src/components/ChatLayout.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import ThreadListSidebar from './ThreadListSidebar';
import ThreadDrawer from './ThreadDrawer';
import ChatWindow from '../ChatWindow';

// Utilitas untuk deteksi perangkat mobile dengan lebih akurat
const isClient = typeof window !== 'undefined';

// Fungsi untuk mendeteksi mobile dengan lebih akurat berdasarkan user agent dan viewport
const getIsMobile = () => {
  if (!isClient) return false;
  
  // 1. Deteksi berdasarkan User Agent (lebih diutamakan)
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  
  // Pattern untuk mendeteksi perangkat mobile berdasarkan user agent
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i;
  
  if (mobileRegex.test(userAgent)) {
    console.log('Mobile terdeteksi berdasarkan User Agent');
    return true;
  }
  
  // 2. Fallback ke deteksi berdasarkan viewport width
  // Untuk perangkat dengan width yang kecil namun bukan mobile (seperti browser yang diperkecil)
  // dan untuk kompabilitas dengan pendekatan sebelumnya
  const isMobileWidth = window.innerWidth < 768;
  console.log('Width check:', window.innerWidth, 'Is mobile width:', isMobileWidth);
  
  return isMobileWidth;
};

export default function ChatLayout() {
  const [threads, setThreads] = useState([]);
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isMobile, setIsMobile] = useState(getIsMobile());
  const [hasEmptyThread, setHasEmptyThread] = useState(false);
  

  // Efek samping untuk deteksi ukuran layar
  useEffect(() => {
    // Pastikan bahwa kode dijalankan di browser, bukan server
    if (!isClient) return;
    
    const handleResize = () => {
      // Gunakan fungsi getIsMobile yang sudah ditingkatkan untuk deteksi yang lebih akurat
      const mobile = getIsMobile();
      console.log('Device check - Width:', window.innerWidth, 'User Agent:', navigator.userAgent);
      console.log('Detected as mobile:', mobile);
      setIsMobile(mobile);
      
      // Jika mobile, pastikan drawer tertutup saat resize
      if (mobile && !isDrawerOpen) {
        setIsDrawerOpen(false);
      }
    };

    // Panggil handleResize saat komponen dimuat
    handleResize();

    // Tambahkan event listener untuk mendeteksi perubahan ukuran layar
    window.addEventListener('resize', handleResize);

    // Bersihkan event listener saat komponen di-unmount
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [isDrawerOpen]);

  useEffect(() => {
    console.log("Drawer open state:", isDrawerOpen);
    console.log("Is mobile:", isMobile);
  }, [isDrawerOpen, isMobile]);

  // Load user and threads + setup realtime
  useEffect(() => {
    let channel;
    const loadUserAndThreads = async () => {
      try {  const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError || !userData?.user) {
        console.error("Auth error:", authError?.message || "User not found");
      return;
    }
    const user = userData.user;
    setCurrentUser(user);

    const { data: threadData, error: threadError } = await supabase
      .from('threads')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (threadError) {
      console.error("Failed to load threads:", threadError.message);
      return;
    }

    setThreads(threadData || []);

    // If no threads exist, create a new one
    if (!selectedThreadId) {
      // Check if there's already an empty thread
      const hasEmptyThread = threads.some(thread => thread.title === 'Untitled');
      if (!hasEmptyThread) {
        createNewThread();
      }
    }
  } catch (error) {
    console.error("Unexpected error:", error);
  }
};

    // Setup realtime listener
    const setupRealtime = () => {
      if (!currentUser) return () => {};
      channel = supabase
        .channel(`threads-${currentUser.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'threads',
            filter: `user_id=eq.${currentUser.id}`,
          },
          (payload) => {
            console.log('Realtime event:', payload.eventType, payload);
            if (payload.eventType === 'INSERT') {
              setThreads((current) => {
                const exists = current.some(thread => thread.id === payload.new.id);
                if (exists) {
                  return current;
                }
                return [payload.new, ...current];
              });
              if (!selectedThreadId) {
                setSelectedThreadId(payload.new.id);
              }
            }
            if (payload.eventType === 'UPDATE') {
              setThreads((current) => {
                const filtered = current.filter(t => t.id !== payload.new.id);
                const updated = [payload.new, ...filtered];
                return updated.sort((a, b) => {
                  const dateA = new Date(b.updated_at || b.created_at);
                  const dateB = new Date(a.updated_at || a.created_at);
                  return dateA - dateB;
                });
              });
            }
            if (payload.eventType === 'DELETE') {
              setThreads((current) =>
                current.filter(thread => thread.id !== payload.old.id)
              );
              if (selectedThreadId === payload.old.id) {
                setThreads((current) => {
                  if (current.length > 0) {
                    setSelectedThreadId(current[0].id);
                  } else {
                    setSelectedThreadId(null);
                  }
                  return current;
                });
              }
            }
          }
        )
        .subscribe();
      return () => {
        if (channel) {
          supabase.removeChannel(channel);
        }
      };
    };

    loadUserAndThreads().then(() => {
      if (currentUser) {
        return setupRealtime();
      }
    });
    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [currentUser, selectedThreadId]);

  // Create new thread with AI-generated title
 const createNewThread = async () => {
  console.log("Creating new thread...");
  if (!currentUser) return;

  // 🔥 Always create a brand-new thread
  const { data: newThread, error } = await supabase
    .from('threads')
    .insert([{ title: 'Untitled', user_id: currentUser.id }])
    .select()
    .single();

  if (error) {
    console.error("Error creating thread:", error.message);
    return;
  }

  setSelectedThreadId(newThread.id);

  // Optional: clear any old messages from view
  const textarea = document.querySelector('textarea');
  if (textarea) {
    textarea.style.height = '40px';
  }
};


  // Delete thread
  const handleDeleteThread = async (threadId) => {
    const threadToDelete = threads.find(t => t.id === threadId);
    if (!threadToDelete) return;
    setThreads(current => current.filter(t => t.id !== threadId));
    if (selectedThreadId === threadId) {
      const remaining = threads.filter(t => t.id !== threadId);
      if (remaining.length > 0) {
        setSelectedThreadId(remaining[0].id);
      } else {
        setSelectedThreadId(null);
      }
    }
    const { error } = await supabase.from('threads').delete().eq('id', threadId);
    if (error) {
      console.error("Error deleting thread:", error.message);
      setThreads(current => [...current, threadToDelete]);
    }
  };

  // Rename thread
  const handleRenameThread = async (threadId, newTitle) => {
    const threadIndex = threads.findIndex(t => t.id === threadId);
    if (threadIndex === -1) return;
    const oldThread = threads[threadIndex];
    const updatedThread = { ...oldThread, title: newTitle };
    setThreads(current => current.map(t => (t.id === threadId ? updatedThread : t)));
    const { error } = await supabase
      .from('threads')
      .update({ title: newTitle })
      .eq('id', threadId);
    if (error) {
      console.error("Error renaming thread:", error.message);
      setThreads(current => current.map(t => (t.id === threadId ? oldThread : t)));
    }
  };

  // Generate thread title using AI
  const generateThreadTitle = async (message) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_THREAD_TITLE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      console.log("Response status:", response.status);
      if (!response.ok) {
        let errorText;
        try {
          errorText = await response.text();
        } catch {
          errorText = 'Unknown error response';
        }
        throw new Error(`API error ${response.status}: ${errorText}`);
      }
      const data = await response.json();
      console.log("Response data:", data);
      const rawTitle = data.title || 'Untitled';
      const sanitizedTitle = rawTitle.trim().replace(/^"|"$/g, '');

      return sanitizedTitle;
    } catch (error) {
      console.error('Error generating thread title:', error);
      return 'Untitled';
    }
  };

  // Logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  return (
    <div className="flex h-screen">
     
      
      {/* Sidebar - Only visible on desktop (md and above) */}
      {!isMobile && (
        <div className="flex">
          <ThreadListSidebar
            threads={threads}
            selectedThreadId={selectedThreadId}
            onSelectThread={setSelectedThreadId}
            onCreateNew={createNewThread}
            onDeleteThread={handleDeleteThread}
            onRenameThread={handleRenameThread}
            onLogout={handleLogout}
            currentUser={currentUser}
          />
        </div>
      )}

      {/* Drawer - Only for mobile, controlled by isDrawerOpen state */}
      <ThreadDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        threads={threads}
        selectedThreadId={selectedThreadId}
        onSelectThread={(id) => {
          setSelectedThreadId(id);
          setIsDrawerOpen(false);
        }}
        onCreateNew={createNewThread}
        onDeleteThread={handleDeleteThread}
        onRenameThread={handleRenameThread}
        onLogout={handleLogout}
        currentUser={currentUser}
      />

      {/* Chat Window */}
      <div className="flex-1 flex flex-col relative">
        {/* Mobile header - Only visible on mobile */}
        {isMobile && (
          <div className="sticky top-0 z-10 flex items-center justify-between p-3 border-b bg-white shadow-sm">
            <button
              onClick={() => setIsDrawerOpen(true)}
              className="p-2 rounded-md text-gray-600 hover:bg-gray-100"
            >
              ☰
            </button>
            <h2 className="text-lg font-medium">Basabisa</h2>
            <button onClick={handleLogout} className="text-sm text-red-500">
              Logout
            </button>
          </div>
        )}
        
        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedThreadId ? (
            <ChatWindow
              threadId={selectedThreadId}
              onCreateThreadWithAutonaming={async (userMessage) => {
                if (!selectedThreadId) return;

                // Generate a thread title using the user's first message
                const generatedTitle = await generateThreadTitle(userMessage);

                // Update the thread title in Supabase
                const { error: updateError } = await supabase
                  .from('threads')
                  .update({ title: generatedTitle })
                  .eq('id', selectedThreadId);

                if (updateError) {
                  console.error("Error updating thread title:", updateError.message);
                } else {
                  // Update the local state with the new title
                  setThreads((current) =>
                    current.map((thread) =>
                      thread.id === selectedThreadId ? { ...thread, title: generatedTitle } : thread
                    )
                  );
                }
              }}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              No conversation selected
            </div>
          )}
        </div>
      </div>
    </div>
  );
}