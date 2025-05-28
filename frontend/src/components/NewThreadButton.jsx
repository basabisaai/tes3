// src/components/NewThreadButton.jsx
export default function NewThreadButton({ onCreate }) {
  return (
    <button
      onClick={onCreate}
      className="w-full flex items-center px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700"
    >
      <span className="mr-2">+</span> New Conversation
    </button>
  );
}