// src/components/ThreadDrawer.jsx
import { useState, useRef, useEffect } from 'react';
import ConfirmModal from './ConfirmModal';

export default function ThreadDrawer({
    isOpen,
    onClose,
    threads,
    selectedThreadId,
    onSelectThread,
    onCreateNew,
    onDeleteThread,
    onRenameThread,
    onLogout,
    currentUser
}) {
    const [activeMenu, setActiveMenu] = useState(null);
    const [editingThreadId, setEditingThreadId] = useState(null);
    const [editingThreadTitle, setEditingThreadTitle] = useState('');
    const [threadIdToDelete, setThreadIdToDelete] = useState(null); // State for delete confirmation
    const menuRef = useRef(null);
    const editInputRef = useRef(null);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setActiveMenu(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Focus input when editing
    useEffect(() => {
        if (editingThreadId && editInputRef.current) {
            editInputRef.current.focus();
            editInputRef.current.select();
        }
    }, [editingThreadId]);

    // Handle thread deletion
    const handleDeleteThread = (threadId) => {
        setThreadIdToDelete(threadId);
    };

    // Start thread rename
    const startRenameThread = (thread) => {
        setEditingThreadId(thread.id);
        setEditingThreadTitle(thread.title || 'Untitled');
        setActiveMenu(null);
    };

    // Handle thread rename
    const handleRenameThread = async (e) => {
        e.preventDefault();
        if (!editingThreadId) return;
        onRenameThread(editingThreadId, editingThreadTitle);
        setEditingThreadId(null);
        setEditingThreadTitle('');
    };

    // Cancel thread rename
    const cancelRename = () => {
        setEditingThreadId(null);
        setEditingThreadTitle('');
    };

    // Group threads by updated_at with more granular categories
    const groupThreadsByTime = (threads) => {
        const groups = {
            Today: [],
            Yesterday: [],
            'Last 7 Days': [],
            Older: []
        };
        const monthNames = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        threads.forEach((thread) => {
            const date = new Date(thread.updated_at || thread.created_at);
            const diffDays = Math.floor((today - date) / (1000 * 60 * 60 * 24));
            const isToday = date.toDateString() === today.toDateString();
            const isYesterday = date.toDateString() === yesterday.toDateString();
            if (isToday) {
                groups.Today.push(thread);
            } else if (isYesterday) {
                groups.Yesterday.push(thread);
            } else if (diffDays < 7) {
                groups['Last 7 Days'].push(thread);
            } else if (diffDays < 90) {
                const monthKey = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
                groups[monthKey] = (groups[monthKey] || []).concat(thread);
            } else {
                groups.Older = (groups.Older || []).concat(thread);
            }
        });
        return groups;
    };

    const [grouped, setGrouped] = useState({});

    // Re-group threads whenever threads change
    useEffect(() => {
        const result = groupThreadsByTime(threads);
        setGrouped(result);
    }, [threads]);



    const renderThreadItem = (thread) => {
        if (editingThreadId === thread.id) {
            return (
                <form onSubmit={handleRenameThread} className="w-full">
                    <div className="flex items-center px-2">
                        <input
                            ref={editInputRef}
                            type="text"
                            value={editingThreadTitle}
                            onChange={(e) => setEditingThreadTitle(e.target.value)}
                            className="flex-1 px-3 py-3 border border-blue-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                            onBlur={handleRenameThread}
                        />
                        <button 
                            type="submit" 
                            className="ml-2 p-2 text-green-600 hover:bg-green-50 rounded"
                            title="Save"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
                                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        </button>
                        <button 
                            type="button" 
                            onClick={cancelRename}
                            className="p-2 text-red-600 hover:bg-red-50 rounded"
                            title="Cancel"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
                                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                </form>
            );
        }

        return (
            <div className="flex items-center w-full">
                <button
  onClick={() => {
    onSelectThread(thread.id);
    onClose();
  }}
  onDoubleClick={() => startRenameThread(thread)}
  className={`flex-1 text-left px-4 py-3 rounded-lg truncate hover:bg-gray-100 text-base ${
    selectedThreadId === thread.id ? 'bg-blue-50 text-blue-600' : ''
  }`}
>
  {thread.title || 'Untitled'}
</button>
<div className="relative">
  <button
    onClick={(e) => {
      e.stopPropagation();
      setActiveMenu(activeMenu === thread.id ? null : thread.id);
    }}
    className="p-2 rounded-full hover:bg-gray-200 text-gray-500"
    title="Thread options"
  >
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1"></circle>
      <circle cx="12" cy="5" r="1"></circle>
      <circle cx="12" cy="19" r="1"></circle>
    </svg>
  </button>
                    {activeMenu === thread.id && (
                        <div 
                            ref={menuRef}
                            className="absolute right-0 z-10 mt-1 bg-white rounded-md shadow-lg py-2 w-48 border border-gray-200"
                        >
                            <button
                                onClick={() => startRenameThread(thread)}
                                className="w-full text-left px-4 py-3 text-base text-gray-700 hover:bg-gray-100 flex items-center"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" 
                                    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" 
                                    className="mr-3">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                                Rename
                            </button>
                            <button
                                onClick={() => handleDeleteThread(thread.id)}
                                className="w-full text-left px-4 py-3 text-base text-red-600 hover:bg-red-50 flex items-center"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" 
                                    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" 
                                    className="mr-3">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    <line x1="10" y1="11" x2="10" y2="17"></line>
                                    <line x1="14" y1="11" x2="14" y2="17"></line>
                                </svg>
                                Delete
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50">
  <div className="absolute inset-y-0 left-0 w-full md:w-64 bg-white shadow-xl flex flex-col">
    {/* Header with Close Button */}
    <div className="flex justify-between items-center p-4 border-b">
      <h2 className="text-xl font-bold text-blue-600">Basabisa</h2>
      <button
        onClick={onClose}
        className="p-2.5 rounded-md hover:bg-gray-100 text-gray-500"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" 
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
    {/* New Chat Button */}
    <div className="p-4">
      <button
        onClick={() => {
          onCreateNew();
          onClose();
        }}
        className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600 transition-colors text-base font-medium"
      >
        + New Chat
      </button>
    </div>
                {/* Thread List */}
                   <div className="flex-1 overflow-y-auto p-4">
{Object.entries(grouped).map(([groupName, threadList]) => {
    // Filter out threads with title "Untitled"
    const filteredThreads = threadList.filter(thread => thread.title !== 'Untitled');
    if (!filteredThreads?.length) return null;
    return (
        <div key={groupName} className="mb-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{groupName}</h3>
            <div className="space-y-1">
                {filteredThreads.map((thread) => (
                    <div key={thread.id} className="flex items-center">
                        {renderThreadItem(thread)}
                    </div>
                ))}
            </div>
        </div>
    );
})}
    </div>
                {/* User Info & Logout */}
              {currentUser && (
      <div className="p-5 border-t">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img
              src={`https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.email?.split('@')[0] || 'User')}`}
              alt="User Avatar"
              className="w-10 h-10 rounded-full"
            />
            <span className="font-medium text-base">{currentUser.email?.split('@')[0] || 'User'}</span>
          </div>
          <button
            onClick={onLogout}
            className="text-base text-red-500 py-2 px-3 rounded-md hover:bg-red-50"
          >
            Logout
          </button>
        </div>
      </div>
    )}
                {/* Modal Konfirmasi Hapus */}
                <ConfirmModal
                    isOpen={!!threadIdToDelete}
                    onClose={() => setThreadIdToDelete(null)}
                    onConfirm={() => {
                        onDeleteThread(threadIdToDelete);
                        setThreadIdToDelete(null);
                    }}
                    message="This action will permanently delete all the chats you've created and cannot be undone. Please confirm to proceed. 此操作将永久删除您创建的所有聊天记录，且无法撤销。请确认后继续。"
                />
            </div>
        </div>
    );
}