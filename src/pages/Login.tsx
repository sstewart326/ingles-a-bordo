import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { db } from '../config/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { signOut, signInWithRedirect, signInWithPopup } from 'firebase/auth';
import { auth } from '../config/firebase';
import { GoogleAuthProvider } from 'firebase/auth';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setError('');
      setLoading(true);
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError('Failed to sign in');
      console.error(err);
    }
    
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    try {
      setError('');
      setLoading(true);
      
      // Clear any pending signup data to ensure we're in login mode
      localStorage.removeItem('pendingSignupToken');
      localStorage.removeItem('pendingSignupValidation');
      
      // Create Google Auth Provider
      const provider = new GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');
      
      // Force account selection
      provider.setCustomParameters({
        prompt: 'select_account'
      });

      // Check if mobile device
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      
      if (isMobile) {
        console.log('Mobile device detected, using redirect flow');
        await signInWithRedirect(auth, provider);
        return; // The redirect will happen here
      }

      // For desktop, continue with popup
      console.log('Starting Google login with popup...');
      const result = await signInWithPopup(auth, provider);
      
      console.log('Checking login result:', {
        success: !!result,
        hasUser: !!result?.user,
        email: result?.user?.email
      });
      
      if (!result.user || !result.user.email) {
        throw new Error('Failed to get user information from Google');
      }

      // Check if this user exists in our database
      const usersRef = collection(db, 'users');
      const q = query(
        usersRef, 
        where('email', '==', result.user.email),
        where('status', '==', 'active')
      );
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        console.log('No active account found for email:', result.user.email);
        setError('No account found. Please sign up first.');
        await signOut(auth);
        return;
      }

      console.log('Login successful, navigating to dashboard');
      navigate('/dashboard');
    } catch (err) {
      console.error('Error during Google sign in:', err);
      setError('Failed to sign in with Google');
    } finally {
      setLoading(false);
    }
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
            Sign in to your account
          </h2>
        </div>
        {error && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="text-sm text-red-700">{error}</div>
          </div>
        )}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md -space-y-px">
            <div className="mb-4">
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
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-black focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-end">
            <div className="text-sm">
              <Link to="/reset-password" className="link !text-gray-700">
                Forgot your password?
              </Link>
            </div>
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
              Sign in with Email
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gray-50 text-gray-500">Or continue with</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path
                  d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"
                  fill="currentColor"
                />
              </svg>
              Sign in with Google
            </button>
          </div>
        </form>
        <div className="text-sm text-center">
          <Link to="/signup" className="link !text-gray-700">
            Don't have an account? Contact cursoinglesabordo@gmail.com
          </Link>
        </div>
      </div>
    </div>
  );
}; 