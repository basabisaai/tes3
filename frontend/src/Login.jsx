import { useState, useEffect } from 'react';
import supabase from './supabaseClient';

export default function Login({ userId, userEmail }) {
  const [user, setUser] = useState(null);

  // ✅ Use props from App.jsx for initial render
  useEffect(() => {
    if (userId) {
      setUser({ id: userId, email: userEmail });
    }
  }, [userId, userEmail]);

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) console.error('Login error:', error);
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.error('Logout error:', error);
  };

  return (
    <div className="p-4">
      {userId ? (
        <div className="flex flex-col">
          <p className="text-green-600 font-medium text-sm mb-2">
            Welcome, {userEmail}
          </p>
          <button 
            onClick={handleLogout}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition duration-200"
          >
            Logout
          </button>
        </div>
      ) : (
        <button 
          onClick={handleLogin}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition duration-200"
        >
          Login with Google
        </button>
      )}
    </div>
  );
}