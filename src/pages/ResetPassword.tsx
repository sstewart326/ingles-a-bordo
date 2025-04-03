import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export const ResetPassword = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { resetPassword } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setError('');
      setMessage('');
      setLoading(true);
      await resetPassword(email);
      setMessage('Check your email for password reset instructions');
      setEmail(''); // Clear the email field after successful submission
    } catch (err) {
      setError('Failed to reset password');
      console.error(err);
    }
    
    setLoading(false);
  };

  return (
    <div className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 min-h-screen bg-gradient-to-b from-sky-100 to-white relative overflow-hidden">
      {/* Decorative airplane elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute right-0 top-20 transform rotate-45 opacity-10">
          <svg width="400" height="400" viewBox="0 0 24 24" fill="currentColor" className="text-sky-600">
            <path d="M22,16v-2l-8.5-5V3.5C13.5,2.67,12.83,2,12,2s-1.5,0.67-1.5,1.5V9L2,14v2l8.5-2.5V19L8,20.5L8,22l4-1l4,1l0-1.5L13.5,19 v-5.5L22,16z"/>
          </svg>
        </div>
        <div className="absolute left-0 bottom-20 transform -rotate-12 opacity-10">
          <svg width="300" height="300" viewBox="0 0 24 24" fill="currentColor" className="text-sky-600">
            <path d="M22,16v-2l-8.5-5V3.5C13.5,2.67,12.83,2,12,2s-1.5,0.67-1.5,1.5V9L2,14v2l8.5-2.5V19L8,20.5L8,22l4-1l4,1l0-1.5L13.5,19 v-5.5L22,16z"/>
          </svg>
        </div>
      </div>
      
      <div className="max-w-md w-full card space-y-8 bg-white/95 backdrop-blur-sm shadow-xl rounded-xl p-8 relative z-10">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold section-title">
            Reset Password
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Enter your email address and we'll send you instructions to reset your password.
          </p>
        </div>
        {error && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="text-sm text-red-700">{error}</div>
          </div>
        )}
        {message && (
          <div className="rounded-md bg-green-50 p-4">
            <div className="text-sm text-green-700">{message}</div>
          </div>
        )}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email-address" className="block text-sm font-medium text-gray-700 mb-1">
              Email address
            </label>
            <input
              id="email-address"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-black focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="flex flex-col space-y-4">
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full flex justify-center items-center"
            >
              {loading ? (
                <div className="loading-spinner mr-2"></div>
              ) : null}
              Reset Password
            </button>
          </div>
        </form>
        <div className="text-sm text-center">
          <Link to="/login" className="link !text-gray-700">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}; 