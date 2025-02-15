import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { validateSignupToken, consumeSignupToken } from '../utils/signupLinks';
import { doc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

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
  const { signup, loginWithGoogle } = useAuth();

  useEffect(() => {
    const validateToken = async () => {
      const token = searchParams.get('token');
      console.log('Initial token validation - token present:', !!token);
      if (!token) {
        setError('Invalid signup link. Please contact your administrator.');
        setValidatingToken(false);
        return;
      }

      try {
        console.log('Validating token...');
        const result = await validateSignupToken(token);
        console.log('Validation result:', result);
        
        if (!result.valid) {
          setError('This signup link is invalid or has expired. Please contact your administrator.');
          setValidatingToken(false);
          return;
        }

        if (result.email) {
          setEmail(result.email);
        }
        setName(result.name || '');
        setValidatingToken(false);
      } catch (err) {
        console.error('Error in validateToken:', err);
        if (err instanceof Error) {
          console.error('Error details:', {
            message: err.message,
            stack: err.stack,
            name: err.name
          });
        }
        setError('Error validating signup link. Please contact your administrator.');
        setValidatingToken(false);
      }
    };

    validateToken();
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Starting form submission...');

    if (password !== confirmPassword) {
      console.log('Password mismatch');
      return setError('Passwords do not match');
    }

    const token = searchParams.get('token');
    console.log('Form submission - token present:', !!token);
    if (!token) {
      return setError('Invalid signup link');
    }

    try {
      setError('');
      setLoading(true);
      
      console.log('Validating token before signup...');
      const result = await validateSignupToken(token);
      console.log('Pre-signup validation result:', result);
      
      if (!result.valid || result.email !== email) {
        console.log('Token validation failed:', { valid: result.valid, emailMatch: result.email === email });
        setError('This signup link is invalid or has expired');
        return;
      }

      console.log('Creating account...');
      await signup(email, password, name, token);

      // After successful signup, mark the token as used
      await consumeSignupToken(token);
      
      console.log('Account created successfully');
      
      navigate('/dashboard');
    } catch (err) {
      console.error('Error in handleSubmit:', err);
      if (err instanceof Error) {
        console.error('Error details:', {
          message: err.message,
          stack: err.stack,
          name: err.name
        });
      }
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

      // First validate the signup token
      const result = await validateSignupToken(token);
      
      if (!result.valid) {
        setError('This signup link is invalid or has expired');
        return;
      }

      // Perform Google sign in
      const googleResult = await loginWithGoogle();
      
      if (!googleResult || !googleResult.user || !googleResult.user.email) {
        throw new Error('Failed to get user information from Google');
      }

      // Verify the email matches the invitation
      if (result.email && result.email !== googleResult.user.email) {
        setError('The Google account email does not match the invitation email');
        return;
      }

      // Find the pending user document
      const usersRef = collection(db, 'users');
      const q = query(
        usersRef, 
        where('email', '==', googleResult.user.email),
        where('status', '==', 'pending')
      );
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        // Update the user document with the new UID and status
        await updateDoc(doc(db, 'users', userDoc.id), {
          status: 'active',
          uid: googleResult.user.uid,
          updatedAt: new Date().toISOString()
        });

        // Mark the signup token as used
        await consumeSignupToken(token);
        
        navigate('/dashboard');
      } else {
        setError('No pending invitation found for this email');
      }
    } catch (err) {
      console.error('Error during Google sign in:', err);
      setError('Failed to sign in with Google. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (validatingToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Validating signup link...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
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
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path
                  d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"
                  fill="currentColor"
                />
              </svg>
              Sign up with Google
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