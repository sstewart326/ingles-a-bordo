import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { updatePassword } from 'firebase/auth';
import { useAuthWithMasquerade } from '../hooks/useAuthWithMasquerade';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { Language } from '../contexts/LanguageContext';
import { getCachedCollection, updateCachedDocument } from '../utils/firebaseUtils';
import { where } from 'firebase/firestore';

interface UserProfile {
  id: string;
  name?: string;
  email: string;
  createdAt: string;
  language?: Language;
  status: string;
  isAdmin: boolean;
  uid: string;
  updatedAt: string;
}

interface ClassContract {
  id: string;
  contractUrl: string;
  courseType: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  scheduleType: 'single' | 'multiple';
  schedules?: any[];
}

const logProfile = (message: string, data?: any) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[PROFILE] ${message}`, data ? data : '');
  }
};

export const Profile = () => {
  const { currentUser, isMasquerading, masqueradingAs } = useAuthWithMasquerade();
  const { language, setLanguage } = useLanguage();
  const t = useTranslation(language);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<Language>(language);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [updateSuccessful, setUpdateSuccessful] = useState(false);
  const [contracts, setContracts] = useState<ClassContract[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(false);

  // Memoize the filtered contracts to prevent unnecessary re-renders
  const memoizedContracts = useMemo(() => {
    return contracts.filter(c => c && c.contractUrl);
  }, [contracts]);

  const fetchProfile = useCallback(async () => {
    if (!currentUser) {
      logProfile('No current user found, returning early');
      setLoading(false);
      return;
    }

    try {
      // If masquerading, use the masqueraded user's ID
      const userIdToFetch = isMasquerading && masqueradingAs ? masqueradingAs.uid || masqueradingAs.id : currentUser.uid;
      
      if (!userIdToFetch) {
        logProfile('No user ID to fetch, returning early');
        setLoading(false);
        return;
      }
      
      logProfile('Attempting to fetch user documents for uid:', userIdToFetch);
      const users = await getCachedCollection<UserProfile>('users', [
        where('uid', '==', userIdToFetch)
      ], { userId: currentUser.uid });
      
      if (!users || users.length === 0) {
        logProfile('No user document found for uid:', userIdToFetch);
        throw new Error('User document not found');
      }

      const userDoc = users[0];
      logProfile('Found user document:', {
        id: userDoc.id,
        name: userDoc.name,
        email: userDoc.email,
        language: userDoc.language
      });
      
      setProfile(userDoc);
      setName(userDoc.name || '');
      setSelectedLanguage(userDoc.language || 'en');
      
      logProfile('State updated with profile data:', {
        profileSet: !!userDoc,
        nameSet: userDoc.name || '',
        languageSet: userDoc.language || 'en'
      });
      
      setLoading(false);
      
      // Fetch contracts for this user
      await fetchContracts(userDoc.email);
    } catch (error) {
      logProfile('Profile fetch - Error:', error);
      if (error instanceof Error) {
        logProfile('Profile fetch - Error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack
        });
      }
      setLoading(false);
    }
  }, [currentUser, isMasquerading, masqueradingAs]);
  
  const fetchContracts = async (email: string) => {
    if (!email) {
      setLoadingContracts(false);
      return;
    }
    
    setLoadingContracts(true);
    try {
      logProfile('Fetching contracts for user:', email);
      
      // Fetch classes without a limit since the CacheOptions doesn't support it
      const classes = await getCachedCollection<ClassContract>(
        'classes', 
        [where('studentEmails', 'array-contains', email)], 
        { userId: currentUser?.uid }
      );
      
      // Set contracts directly without filtering here
      // The filtering is now handled by the memoizedContracts
      logProfile('Found classes:', classes.length);
      setContracts(classes);
      setLoadingContracts(false);
    } catch (error) {
      logProfile('Contracts fetch - Error:', error);
      if (error instanceof Error) {
        logProfile('Contracts fetch - Error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack
        });
      }
      // Ensure we set loading to false and set contracts to empty array on error
      setContracts([]);
      setLoadingContracts(false);
    }
  };

  useEffect(() => {
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid, isMasquerading, masqueradingAs?.id]);

  // Add new useEffect to handle success message after language updates
  useEffect(() => {
    if (updateSuccessful) {
      setSuccess(t.profileUpdated);
      setUpdateSuccessful(false);
    }
  }, [language, t, updateSuccessful]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setUpdateSuccessful(false);

    if (!currentUser) return;

    try {
      logProfile('Attempting to fetch current user document for uid:', currentUser.uid);
      const users = await getCachedCollection<UserProfile>('users', [
        where('uid', '==', currentUser.uid)
      ], { userId: currentUser.uid });
      
      if (!users || users.length === 0) {
        logProfile('Profile update - User document not found for uid:', currentUser.uid);
        throw new Error('User document not found');
      }

      const userDoc = users[0];
      logProfile('Profile update - Current document data:', userDoc);
      
      // Only include fields that have actually changed and have valid values
      const updates: { name?: string; language?: Language } = {};
      
      if (name !== userDoc.name && name.trim() !== '') {
        updates.name = name;
      }
      if (selectedLanguage !== userDoc.language && selectedLanguage) {
        updates.language = selectedLanguage;
      }

      logProfile('Profile update - Current user:', currentUser.uid);
      logProfile('Profile update - Updates to apply:', updates);
      logProfile('Profile update - Fields being updated:', Object.keys(updates));

      if (Object.keys(updates).length === 0) {
        logProfile('Profile update - No changes detected or no valid values to update, skipping update');
        setUpdateSuccessful(true);
        setEditing(false);
        return;
      }

      logProfile('Profile update - Attempting to update document');
      try {
        // Always update using the document ID from the query result
        await updateCachedDocument('users', userDoc.id, updates, { userId: currentUser.uid });
        logProfile('Profile update - Document updated successfully');
        
        if (selectedLanguage !== userDoc.language) {
          logProfile('Profile update - Attempting to update language context');
          await setLanguage(selectedLanguage);
          logProfile('Profile update - Language context updated successfully');
        }

        // Only attempt to update password if not masquerading and password fields are filled
        if (newPassword && !isMasquerading && 'updatePassword' in currentUser) {
          if (newPassword !== confirmPassword) {
            setError(t.error);
            return;
          }
          await updatePassword(currentUser, newPassword);
        } else if (newPassword && isMasquerading) {
          // Show a message that password can't be updated while masquerading
          setError('Password cannot be updated while impersonating a user');
          return;
        }

        await fetchProfile();
        setEditing(false);
        setNewPassword('');
        setConfirmPassword('');
        setUpdateSuccessful(true);
      } catch (docError) {
        logProfile('Profile update - Document update error:', docError);
        if (docError instanceof Error) {
          logProfile('Profile update - Error details:', {
            message: docError.message,
            name: docError.name,
            stack: docError.stack
          });
          logProfile('Profile update - Update operation details:', {
            documentId: userDoc.id,  // Log the actual document ID being used
            currentData: userDoc,
            attemptedUpdates: updates,
            userId: currentUser.uid,
            userEmail: currentUser.email
          });
        }
        throw docError;
      }
    } catch (error) {
      logProfile('Profile update - Error:', error);
      if (error instanceof Error) {
        logProfile('Profile update - Error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack
        });
      }
      setError('Failed to update profile');
    }
  };
  
  // Helper function to get day name
  const getDayName = (dayOfWeek: number) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayOfWeek];
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-white">
      <div className="py-6 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="md:flex md:flex-col">
          <div className="mb-8">
            <h3 className="text-2xl font-medium leading-6 text-gray-900">{t.profile}</h3>
            {isMasquerading && masqueradingAs && (
              <div className="mt-2 bg-indigo-50 border border-indigo-200 rounded-md p-3">
                <p className="text-sm text-indigo-700">
                  You are viewing {masqueradingAs.name || masqueradingAs.email}'s profile as an administrator.
                  Some actions like password changes are disabled while impersonating.
                </p>
              </div>
            )}
            <p className="mt-2 text-sm text-gray-600">
              {t.updateProfile}
            </p>
          </div>

          <div className="w-full">
            <div className="shadow sm:rounded-lg sm:overflow-hidden">
              <div className="px-4 py-5 bg-white space-y-6 sm:p-6">
                {error && (
                  <div className="rounded-md bg-red-50 p-4">
                    <div className="text-sm text-red-700">{error}</div>
                  </div>
                )}
                {success && (
                  <div className="rounded-md bg-green-50 p-4">
                    <div className="text-sm text-green-700">{success}</div>
                  </div>
                )}

                {!editing ? (
                  <div className="space-y-6">
                    <dl className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                      <div className="px-4 py-5 bg-gray-50 shadow rounded-lg overflow-hidden sm:p-6">
                        <dt className="text-sm font-medium text-gray-500 truncate">{t.name}</dt>
                        <dd className="mt-1 text-lg font-semibold text-gray-900">
                          {profile?.name || 'Not set'}
                        </dd>
                      </div>
                      <div className="px-4 py-5 bg-gray-50 shadow rounded-lg overflow-hidden sm:p-6">
                        <dt className="text-sm font-medium text-gray-500 truncate">{t.email}</dt>
                        <dd className="mt-1 text-lg font-semibold text-gray-900">
                          {profile?.email}
                        </dd>
                      </div>
                      <div className="px-4 py-5 bg-gray-50 shadow rounded-lg overflow-hidden sm:p-6">
                        <dt className="text-sm font-medium text-gray-500 truncate">{t.language}</dt>
                        <dd className="mt-1 text-lg font-semibold text-gray-900">
                          {profile?.language === 'pt-BR' ? 'Português' : 'English'}
                        </dd>
                      </div>
                    </dl>
                    
                    {/* Contracts Section */}
                    {!profile?.isAdmin && (
                      <div className="mt-8">
                        <h4 className="text-lg font-medium text-gray-900 mb-4">Your Contracts</h4>
                        {loadingContracts ? (
                          <div className="flex items-center justify-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                          </div>
                        ) : memoizedContracts && memoizedContracts.length > 0 ? (
                          <div className="bg-gray-50 shadow rounded-lg overflow-hidden">
                            <ul className="divide-y divide-gray-200">
                              {memoizedContracts.slice(0, 10).map((contract) => (
                                <li key={contract.id} className="px-4 py-4">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="text-sm font-medium text-gray-900">
                                        {contract.courseType || 'Class'} Class
                                      </p>
                                      <p className="text-sm text-gray-500">
                                        {contract.scheduleType === 'single' ? (
                                          <>
                                            {getDayName(contract.dayOfWeek)} at {contract.startTime || '00:00'} - {contract.endTime || '00:00'}
                                          </>
                                        ) : (
                                          <>
                                            Multiple days schedule
                                          </>
                                        )}
                                      </p>
                                    </div>
                                    {contract.contractUrl && (
                                      <a
                                        href={contract.contractUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                                      >
                                        View Contract
                                      </a>
                                    )}
                                  </div>
                                </li>
                              ))}
                              {memoizedContracts.length > 10 && (
                                <li className="px-4 py-2 text-center text-sm text-gray-500">
                                  Showing 10 of {memoizedContracts.length} contracts
                                </li>
                              )}
                            </ul>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">No contracts available.</p>
                        )}
                      </div>
                    )}
                    
                    <div className="mt-6">
                      <button
                        onClick={() => setEditing(true)}
                        className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        {t.edit}
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                        {t.name}
                      </label>
                      <input
                        type="text"
                        name="name"
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                      />
                    </div>

                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                        {t.email}
                      </label>
                      <input
                        type="email"
                        name="email"
                        id="email"
                        value={profile?.email}
                        disabled
                        className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md bg-gray-50"
                      />
                    </div>

                    <div>
                      <label htmlFor="language" className="block text-sm font-medium text-gray-700">
                        {t.language}
                      </label>
                      <select
                        id="language"
                        name="language"
                        value={selectedLanguage}
                        onChange={(e) => setSelectedLanguage(e.target.value as Language)}
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                      >
                        <option value="en">English</option>
                        <option value="pt-BR">Português</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="new-password" className="block text-sm font-medium text-gray-700">
                        {t.newPassword}
                      </label>
                      <input
                        type="password"
                        name="new-password"
                        id="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        disabled={isMasquerading}
                        className={`mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md ${isMasquerading ? 'bg-gray-50' : ''}`}
                      />
                      {isMasquerading && (
                        <p className="mt-1 text-xs text-gray-500">Password changes are disabled while impersonating a user.</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700">
                        {t.confirmPassword}
                      </label>
                      <input
                        type="password"
                        name="confirm-password"
                        id="confirm-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={isMasquerading}
                        className={`mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md ${isMasquerading ? 'bg-gray-50' : ''}`}
                      />
                    </div>

                    <div className="flex justify-end space-x-3">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(false);
                          setNewPassword('');
                          setConfirmPassword('');
                          setName(profile?.name || '');
                          setSelectedLanguage(profile?.language || 'en');
                        }}
                        className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        {t.cancel}
                      </button>
                      <button
                        type="submit"
                        className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        {t.save}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}; 
