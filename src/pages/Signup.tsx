import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { validateSignupToken } from '../utils/signupLinks';

export const Signup = () => {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [validatingToken, setValidatingToken] = useState(true);
  const navigate = useNavigate();
  const { signup, loginWithGoogle, clearAuthError } = useAuth();

  useEffect(() => {
    const validateToken = async () => {
      const token = searchParams.get('token');
      const error = searchParams.get('error');
      
      // Clean up any existing redirect state
      localStorage.removeItem('auth_debug_redirect_start');
      localStorage.removeItem('auth_debug_id');
      localStorage.removeItem('auth_debug_stored');
      localStorage.removeItem('pendingSignupToken');
      localStorage.removeItem('pendingSignupValidation');
      
      if (error) { 
        switch (error) {
          case 'email_mismatch':
            setError('The Google account email does not match the invitation email. Please try again with the correct Google account.');
            break;
          case 'no_invitation':
            setError('No pending invitation found for this email. Please contact your administrator.');
            break;
          case 'auth_failed':
            setError('Authentication failed. Please try again with Google sign-in.');
            break;
          case 'signup_failed':
            setError('Failed to complete the signup process. Please try again or contact support.');
            break;
          default:
            setError('An error occurred during signup. Please try again or contact your administrator.');
        }
        setValidatingToken(false);
        return;
      }

      if (!token) {
        setError('Invalid signup link. Please contact your administrator.');
        setValidatingToken(false);
        return;
      }

      try {
        if (process.env.NODE_ENV === 'development') {
        }
        
        const result = await validateSignupToken(token);
        
        if (!result.valid) {
          navigate('/');
          return;
        }

        if (result.email) {
          setEmail(result.email);
        }
        setName(result.name || '');
        setValidatingToken(false);
      } catch (err) {
        setError('Error validating signup link. Please contact your administrator.');
        setValidatingToken(false);
      }
    };

    validateToken();
  }, [searchParams, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      return setError('Passwords do not match');
    }

    const token = searchParams.get('token');
    if (!token) {
      return setError('Invalid signup link');
    }

    try {
      setError('');
      setLoading(true);
      
      const result = await validateSignupToken(token);
      
      if (!result.valid || result.email !== email) {
        setError('This signup link is invalid or has expired');
        return;
      }

      await signup(email, password, token);
            
      navigate('/dashboard');
    } catch (err) {
      setError('Failed to create an account');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    const token = searchParams.get('token');
    
    if (!token) {
      return setError('Invalid signup link');
    }

    try {
      setError('');
      setLoading(true);
      clearAuthError();

      const result = await validateSignupToken(token);
      
      if (!result.valid) {
        setError('This signup link is invalid or has expired');
        return;
      }

      const signupData = {
        token,
        validation: {
          valid: result.valid,
          email: result.email,
          name: result.name,
          token: result.token
        }
      };
      
      localStorage.setItem('pendingSignupToken', token);
      localStorage.setItem('pendingSignupValidation', JSON.stringify(signupData.validation));

      await loginWithGoogle(signupData);
    } catch (err) {
      setError('Failed to complete signup. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (validatingToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-sky-100 to-white relative overflow-hidden">
        <div className="text-center bg-white/95 backdrop-blur-sm shadow-xl rounded-xl p-8 relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Processing signup...</p>
          <p className="mt-2 text-sm text-gray-500">Please wait while we complete your registration.</p>
        </div>
      </div>
    );
  }

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
          <div className="flex justify-center">
            <img 
              src="/IAB.png" 
              alt="Inglés a Bordo" 
              className="h-24 mb-3"
            />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold section-title">
            Create your account
          </h2>
        </div>
        {error && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="text-sm text-red-700">{error}</div>
          </div>
        )}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="name" className="sr-only">
                Full Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                disabled
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm bg-gray-100"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="email-address" className="sr-only">
                Email address
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                disabled
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 bg-gray-100 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                value={email}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="sr-only">
                Confirm Password
              </label>
              <input
                id="confirm-password"
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col space-y-4">
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Creating account...' : 'Sign up with Email'}
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
              onClick={(e) => {
                e.preventDefault();
                handleGoogleSignIn();
              }}
              disabled={loading}
              className="w-full flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              <img 
                src="https://developers.google.com/identity/images/g-logo.png" 
                alt="Google logo" 
                className="w-5 h-5 mr-2"
              />
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-700 mr-2"></div>
                  Connecting to Google...
                </>
              ) : (
                'Sign up with Google'
              )}
            </button>
          </div>
        </form>
        <div className="text-sm text-center">
          <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
            Already have an account? Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}; 