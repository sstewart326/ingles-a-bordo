import React, { useState, useEffect, useCallback } from 'react';
import { updatePassword } from 'firebase/auth';
import { useAuth } from '../hooks/useAuth';
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

export const Profile = () => {
  const { currentUser } = useAuth();
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

  const fetchProfile = useCallback(async () => {
    if (!currentUser) return;

    try {
      console.log('Profile fetch - Attempting to fetch user document for uid:', currentUser.uid);
      const users = await getCachedCollection<UserProfile>('users', [
        where('uid', '==', currentUser.uid)
      ], { userId: currentUser.uid });
      
      if (!users || users.length === 0) {
        console.error('Profile fetch - User document not found for uid:', currentUser.uid);
        throw new Error('User document not found');
      }

      const userDoc = users[0];
      console.log('Profile fetch - Successfully retrieved user document:', userDoc);
      setProfile(userDoc);
      setName(userDoc.name || '');
      setSelectedLanguage(userDoc.language || 'en');
      
      setLoading(false);
    } catch (error) {
      console.error('Profile fetch - Error:', error);
      if (error instanceof Error) {
        console.error('Profile fetch - Error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack
        });
      }
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!currentUser) return;

    try {
      console.log('Profile update - Attempting to fetch current user document for uid:', currentUser.uid);
      const users = await getCachedCollection<UserProfile>('users', [
        where('uid', '==', currentUser.uid)
      ], { userId: currentUser.uid });
      
      if (!users || users.length === 0) {
        console.error('Profile update - User document not found for uid:', currentUser.uid);
        throw new Error('User document not found');
      }

      const userDoc = users[0];
      console.log('Profile update - Current document data:', userDoc);
      
      // Only include fields that have actually changed and have valid values
      const updates: { name?: string; language?: Language } = {};
      
      if (name !== userDoc.name && name.trim() !== '') {
        updates.name = name;
      }
      if (selectedLanguage !== userDoc.language && selectedLanguage) {
        updates.language = selectedLanguage;
      }

      console.log('Profile update - Current user:', currentUser.uid);
      console.log('Profile update - Updates to apply:', updates);
      console.log('Profile update - Fields being updated:', Object.keys(updates));

      if (Object.keys(updates).length === 0) {
        console.log('Profile update - No changes detected or no valid values to update, skipping update');
        setSuccess(t.profileUpdated);
        setEditing(false);
        return;
      }

      console.log('Profile update - Attempting to update document');
      try {
        await updateCachedDocument('users', userDoc.id, updates, { userId: currentUser.uid });
        console.log('Profile update - Document updated successfully');
        
        if (selectedLanguage !== userDoc.language) {
          console.log('Profile update - Attempting to update language context');
          await setLanguage(selectedLanguage);
          console.log('Profile update - Language context updated successfully');
        }
      } catch (docError) {
        console.error('Profile update - Document update error:', docError);
        if (docError instanceof Error) {
          console.error('Profile update - Error details:', {
            message: docError.message,
            name: docError.name,
            stack: docError.stack
          });
          console.error('Profile update - Update operation details:', {
            documentId: currentUser.uid,
            currentData: userDoc,
            attemptedUpdates: updates,
            userId: currentUser.uid,
            userEmail: currentUser.email
          });
        }
        throw docError;
      }

      if (newPassword) {
        if (newPassword !== confirmPassword) {
          setError(t.error);
          return;
        }
        await updatePassword(currentUser, newPassword);
      }

      await fetchProfile();
      setEditing(false);
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(t.profileUpdated);
    } catch (error) {
      console.error('Profile update - Error:', error);
      if (error instanceof Error) {
        console.error('Profile update - Error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack
        });
      }
      setError('Failed to update profile');
    }
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
                        className="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                      />
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
                        className="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
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
