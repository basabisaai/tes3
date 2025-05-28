// src/components/ConfirmModal.jsx
import React from 'react';

export default function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    message = "Apakah Anda yakin ingin menghapus ini?",
}) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
                <h3 className="text-lg font-semibold text-gray-800">Delete chat? 删除聊天?</h3>
                <p className="mt-2 text-sm text-gray-600">{message}</p>
                <div className="mt-4 flex justify-end space-x-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 text-sm bg-red-500 text-white hover:bg-red-600 rounded-md"
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}