// src/components/ThreadListSidebar.jsx
import { useState, useRef, useEffect } from 'react';
import ConfirmModal from './ConfirmModal';

export default function ThreadListSidebar({
    threads,
    selectedThreadId,
    onSelectThread,
    onCreateNew,
    onDeleteThread,
    onRenameThread,
    onLogout,
    currentUser
}) {
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
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
                            className="flex-1 px-2 py-2 border border-blue-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            onBlur={handleRenameThread}
                        />
                        <button 
                            type="submit" 
                            className="ml-1 p-1 text-green-600 hover:bg-green-50 rounded"
                            title="Save"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        </button>
                        <button 
                            type="button" 
                            onClick={cancelRename}
                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                            title="Cancel"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
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
                    onClick={() => onSelectThread(thread.id)}
                    onDoubleClick={() => startRenameThread(thread)} // Add this line
                    className={`flex-1 text-left px-3 py-2 rounded-lg truncate hover:bg-gray-100 ${
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
                        className="p-1.5 rounded-full hover:bg-gray-200 text-gray-500"
                        title="Thread options"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="1"></circle>
                            <circle cx="12" cy="5" r="1"></circle>
                            <circle cx="12" cy="19" r="1"></circle>
                        </svg>
                    </button>
                    {activeMenu === thread.id && (
                        <div 
                            ref={menuRef}
                            className="absolute right-0 z-10 mt-1 bg-white rounded-md shadow-lg py-1 w-40 border border-gray-200"
                        >
                            <button
                                onClick={() => startRenameThread(thread)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" 
                                    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" 
                                    className="mr-2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                                Rename
                            </button>
                            <button
                                onClick={() => handleDeleteThread(thread.id)}
                                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" 
                                    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" 
                                    className="mr-2">
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

    return (
        <div className={`bg-white border-r border-gray-200 overflow-y-auto transition-all duration-300 ease-in-out h-full flex flex-col ${
            isCollapsed ? 'w-16 p-2' : 'w-64 p-4'
        }`}>
            {/* Header with Logo */}
            {!isCollapsed && (
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-blue-600">Basabisa</h2>
                    <button
                        onClick={() => setIsCollapsed(true)}
                        className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition-colors"
                        title="Hide Sidebar"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
                             fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
                        </svg>
                    </button>
                </div>
            )}
            {/* New Chat Button */}
            {!isCollapsed && (
                <div className="mb-4">
                    <button
                        onClick={onCreateNew}
                        className="w-full bg-blue-500 text-white py-2 px-3 rounded-lg hover:bg-blue-600 transition-colors text-sm"
                    >
                        + New Chat
                    </button>
                </div>
            )}
            {/* Thread List */}
            <div className={`transition-opacity duration-300 flex-1 overflow-y-auto ${isCollapsed ? 'opacity-0 hidden' : 'opacity-100'}`}>
                {Object.entries(grouped).map(([groupName, threadList]) => {
                    if (!threadList?.length) return null;
                    return (
                        <div key={groupName} className="mb-6">
                            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{groupName}</h3>
                            <div className="space-y-1">
{threadList
  .filter(thread => thread.title !== 'Untitled') // Filter out empty threads
  .map((thread) => (
    <div key={thread.id} className="flex items-center">
      {renderThreadItem(thread)}
    </div>
  ))
}
                            </div>
                        </div>
                    );
                })}
            </div>
            {/* Tombol Expand Kalau Collapsed */}
            {isCollapsed && (
                <div className="flex flex-col items-center space-y-4 mt-4">
                    <button
                        onClick={onCreateNew}
                        className="p-2 rounded-full bg-blue-500 text-white hover:bg-blue-600 transition-colors shadow-md"
                        title="New Chat"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
                             fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                    </button>
                    <button
                        onClick={() => setIsCollapsed(false)}
                        className="p-2 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors shadow-md"
                        title="Show Sidebar"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
                             fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M13 17l5-5-5-5M6 17l5-5-5-5" />
                        </svg>
                    </button>
                </div>
            )}
            {/* User Info & Dropdown Logout */}
            {!isCollapsed && currentUser && (
                <div className="mt-auto pt-4 border-t">
                    <div className="flex items-center space-x-3 text-sm relative">
                        <img
                            src={`https://ui-avatars.com/api/?name=   ${encodeURIComponent(currentUser.email?.split('@')[0] || 'User')}`}
                            alt="User Avatar"
                            className="w-8 h-8 rounded-full"
                        />
                        <button
                            onClick={() => setShowUserMenu(!showUserMenu)}
                            className="font-medium truncate focus:outline-none"
                        >
                            {currentUser.email?.split('@')[0] || 'User'}
                        </button>
                    </div>
                    {showUserMenu && (
                        <div className="absolute bottom-12 left-4 mb-2 w-56 border border-gray-200 z-10 bg-white shadow-md rounded-md">
                            <button
                                onClick={onLogout}
                                className="block w-full text-left px-4 py-2 text-red-500 hover:bg-red-50"
                            >
                                Logout
                            </button>
                        </div>
                    )}
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
    );
}