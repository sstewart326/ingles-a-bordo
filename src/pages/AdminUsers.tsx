import { useState, useEffect, useCallback } from 'react';
import { doc, collection, where } from 'firebase/firestore';
import { db, functions } from '../config/firebase';
import { getAuth } from 'firebase/auth';
import { createSignupLink } from '../utils/signupLinks';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import { useAdmin } from '../hooks/useAdmin';
import { getCachedCollection, deleteCachedDocument, setCachedDocument, updateCachedDocument } from '../utils/firebaseUtils';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { cache } from '../utils/cache';
import { PencilIcon } from '@heroicons/react/24/outline';
import { styles } from '../styles/styleUtils';

interface User {
  id: string;
  uid?: string;  // Firebase Auth UID
  email: string;
  name: string;
  isAdmin: boolean;
  isTeacher?: boolean;
  status?: 'active' | 'pending';
  createdAt: string | Date;
  birthdate?: string;  // Add birthdate to User interface
}

interface NewUser {
  email: string;
  name: string;
  isTeacher: boolean;
  isAdmin: boolean;
  birthdate?: string;  // Optional birthdate field
  paymentConfig?: any;
}

const logAdmin = (message: string, data?: any) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[ADMIN-USERS] ${message}`, data ? data : '');
  }
};

export const AdminUsers = () => {
  const { currentUser } = useAuth();
  const { isAdmin } = useAdmin();
  const { language } = useLanguage();
  const t = useTranslation(language);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMobileView, setShowMobileView] = useState(window.innerWidth < 768);
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUser, setNewUser] = useState<NewUser>({ 
    email: '', 
    name: '',
    isTeacher: false,
    isAdmin: false,
    birthdate: ''  // Initialize birthdate field
  });
  const [recentSignupLinks, setRecentSignupLinks] = useState<{[email: string]: string}>({});
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const fetchUsers = useCallback(async () => {
    try {
      // Force a fresh fetch from Firestore by clearing the cache first
      cache.clearAll();
      
      const usersList = await getCachedCollection<User>('users', [], { 
        userId: currentUser?.uid
      });
      const updatedUsersList = usersList.map(user => ({
        ...user,
        status: user.status === 'pending' ? 'pending' : 'active'
      })) as User[];
      setUsers(updatedUsersList);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to fetch users');
    } finally {
      setLoading(false);
    }
  }, [currentUser?.uid]);

  useEffect(() => {
    const fetchUsersData = async () => {
      await fetchUsers();
    };
    fetchUsersData();

    const handleResize = () => {
      setShowMobileView(window.innerWidth < 768);
    };

    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      
      const hasHorizontalScroll = target.scrollWidth > target.clientWidth;
      const isScrolledToEnd = target.scrollLeft + target.clientWidth >= target.scrollWidth - 10;
      setShowScrollIndicator(hasHorizontalScroll && !isScrolledToEnd);
    };

    window.addEventListener('resize', handleResize);
    const tableContainer = document.querySelector('.table-container');
    if (tableContainer) {
      tableContainer.addEventListener('scroll', handleScroll);
      // Initial check
      handleScroll({ target: tableContainer } as unknown as Event);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (tableContainer) {
        tableContainer.removeEventListener('scroll', handleScroll);
      }
    };
  }, [fetchUsers]);

  const deleteUser = async (userId: string) => {
    // Security checks
    if (!currentUser || !isAdmin) {
      toast.error(t.unauthorizedAction);
      return;
    }

    if (userId === currentUser.uid) {
      toast.error(t.cannotDeleteOwnAccount);
      return;
    }

    // Get user details for confirmation
    const userToDelete = users.find(user => user.id === userId);
    if (!userToDelete) {
      toast.error(t.userNotFound);
      return;
    }

    logAdmin('User to delete:', { email: userToDelete.email, uid: userToDelete.uid });

    const userType = userToDelete.isAdmin ? 'admin' : userToDelete.isTeacher ? 'teacher' : 'student';
    const confirmMessage = `Are you sure you want to delete ${userToDelete.name} (${userToDelete.email})?\n\nThis will permanently delete this ${userType}'s account and remove them from all associated classes.\n\nThis action cannot be undone.`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      // First, get all classes where this user is a student
      const userClasses = await getCachedCollection<{ id: string }>('classes', [
        where('studentEmails', 'array-contains', userToDelete.email)
      ], {
        userId: currentUser.uid
      });

      // For each class, get and delete associated materials
      for (const classDoc of userClasses) {
        const classMaterials = await getCachedCollection<{ id: string }>('classMaterials', [
          where('classId', '==', classDoc.id),
          where('studentEmails', 'array-contains', userToDelete.email)
        ], {
          userId: currentUser.uid
        });

        // Delete each material document
        for (const material of classMaterials) {
          await deleteCachedDocument('classMaterials', material.id);
        }

        // Delete the class document
        await deleteCachedDocument('classes', classDoc.id);
      }

      try {
        // Only attempt to delete from Firebase Auth if the user has a uid
        if (userToDelete.uid) {
          // Get the current user's ID token
          const auth = getAuth();
          const idToken = await auth.currentUser?.getIdToken();

          if (!idToken) {
            throw new Error('No ID token available');
          }

          // Get the functions URL from the Firebase config
          const isDevelopment = import.meta.env.MODE === 'development';
          const functionUrl = isDevelopment
            ? `http://localhost:5001/${functions.app.options.projectId}/${functions.region}/deleteAuthUserHttp`
            : `${functions.customDomain || `https://${functions.region}-${functions.app.options.projectId}.cloudfunctions.net`}/deleteAuthUserHttp`;
          logAdmin('Attempting to delete user with auth ID:', userToDelete.uid);
          
          const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ userId: userToDelete.uid })
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to delete user');
          }

          const result = await response.json();
          logAdmin('Delete auth user function result:', result);
          logAdmin('Successfully called delete function');
        } else {
          logAdmin('No Firebase Auth user found - skipping auth deletion');
        }
        
        await deleteCachedDocument('users', userId);
        logAdmin('Successfully deleted user document');
      } catch (error: unknown) {
        logAdmin('Error in delete process:', {
          error,
          message: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
      }

      await fetchUsers();
      toast.success(t.userDeleted);
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error(t.failedToDeleteUser);
    }
  };

  const handleNewUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.email || !newUser.name) {
      toast.error(t.pleaseEnterNameEmail);
      return;
    }

    try {
      setLoading(true);
      const signupLink = await createSignupLink(newUser.email, newUser.name);
      
      // Store the signup link
      setRecentSignupLinks(prev => ({
        ...prev,
        [newUser.email]: signupLink
      }));
      
      // Create a new document with a temporary ID that includes 'pending_' prefix
      const tempId = `${doc(collection(db, 'users')).id}`;
      
      const newUserData: User = {
        id: tempId,
        email: newUser.email,
        name: newUser.name,
        isAdmin: newUser.isAdmin,
        isTeacher: newUser.isTeacher,
        status: 'pending',
        createdAt: new Date().toISOString(),
        birthdate: newUser.birthdate || undefined  // Include birthdate in newUserData
      };
      
      // Use setCachedDocument to properly handle caching
      await setCachedDocument('users', tempId, newUserData, { userId: currentUser?.uid });
      
      // Update local state immediately with the new user
      setUsers(prevUsers => [...prevUsers, newUserData]);
      
      // Copy to clipboard
      await navigator.clipboard.writeText(signupLink);
      
      setNewUser({ 
        email: '', 
        name: '', 
        isTeacher: false,
        isAdmin: false,
        birthdate: ''  // Reset birthdate field
      }); // Reset form
      
      // Hide the form
      const form = document.getElementById('addUserForm');
      if (form) {
        form.classList.add('hidden');
      }
      
      toast.success(t.signupLinkCopied);
    } catch (error) {
      console.error('Error generating signup link:', error);
      toast.error(t.failedToGenerateLink);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateName = async (userId: string) => {
    if (!currentUser || !isAdmin) {
      toast.error(t.unauthorizedAction);
      return;
    }

    try {
      const userToUpdate = users.find(user => user.id === userId);
      if (!userToUpdate) {
        toast.error(t.userNotFound);
        return;
      }

      if (!editingName.trim()) {
        toast.error(t.pleaseEnterName);
        return;
      }

      await updateCachedDocument('users', userId, { 
        name: editingName.trim(),
        updatedAt: new Date().toISOString()
      }, { userId: currentUser.uid });

      await fetchUsers();
      setEditingUserId(null);
      setEditingName('');
      toast.success(t.nameUpdated);
    } catch (error) {
      console.error('Error updating user name:', error);
      toast.error(t.failedToUpdateName);
    }
  };

  if (loading) {
    return <div className="text-center p-4">{t.loading}</div>;
  }

  const allUsers = users.sort((a, b) => {
    if (a.isAdmin && !b.isAdmin) return -1;
    if (!a.isAdmin && b.isAdmin) return 1;
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return a.name.localeCompare(b.name);
  });

  const renderMobileCard = (user: User) => (
    <div key={user.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
      <div className="flex justify-between items-start mb-3">
        <div>
          {editingUserId === user.id ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm"
                placeholder={t.enterName}
              />
              <button
                onClick={() => handleUpdateName(user.id)}
                className="bg-green-500 hover:bg-green-600 text-white px-2 py-1 rounded text-sm"
              >
                {t.save}
              </button>
              <button
                onClick={() => {
                  setEditingUserId(null);
                  setEditingName('');
                }}
                className="bg-gray-500 hover:bg-gray-600 text-white px-2 py-1 rounded text-sm"
              >
                {t.cancel}
              </button>
            </div>
          ) : (
            <>
              <div className="font-semibold text-gray-900 flex items-center gap-2">
                {user.name}
                {user.status === 'active' && (
                  <PencilIcon
                    className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-pointer"
                    title={t.edit}
                    onClick={() => {
                      setEditingUserId(user.id);
                      setEditingName(user.name);
                    }}
                  />
                )}
              </div>
              <div className="text-sm text-gray-600">{user.email}</div>
            </>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          {user.status === 'active' ? (
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
              user.isAdmin
                ? 'bg-green-100 text-green-800'
                : user.isTeacher
                ? 'bg-blue-100 text-blue-800'
                : 'bg-gray-100 text-gray-800'
            }`}>
              {user.isAdmin ? 'Admin' : user.isTeacher ? t.teacherAccount : t.activeUser}
            </span>
          ) : (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
              {t.pendingSignup}
            </span>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-4">
        {user.status === 'active' ? (
          <button
            onClick={() => deleteUser(user.id)}
            className={`${styles.buttons.danger} w-[120px]`}
          >
            {t.delete}
          </button>
        ) : (
          <>
            <button
              onClick={async () => {
                try {
                  let signupLink = recentSignupLinks[user.email];
                  if (!signupLink) {
                    signupLink = await createSignupLink(user.email, user.name);
                    setRecentSignupLinks(prev => ({
                      ...prev,
                      [user.email]: signupLink
                    }));
                  }
                  await navigator.clipboard.writeText(signupLink);
                  toast.success(t.signupLinkCopied);
                } catch (error) {
                  console.error('Error copying signup link:', error);
                  toast.error(t.failedToCopyLink);
                }
              }}
              className={`${styles.buttons.primary} w-[120px]`}
            >
              {t.copyLink}
            </button>
            <button
              onClick={() => deleteUser(user.id)}
              className={`${styles.buttons.danger} w-[120px]`}
            >
              {t.delete}
            </button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex-1">
      <div className="py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className={styles.headings.h1}>{t.manageUsers}</h1>
          <div className="relative">
            <button
              onClick={() => {
                setShowAddForm(!showAddForm);
                if (!showAddForm) {
                  const form = document.getElementById('addUserForm');
                  if (form) {
                    form.classList.remove('hidden');
                  }
                } else {
                  const form = document.getElementById('addUserForm');
                  if (form) {
                    form.classList.add('hidden');
                  }
                }
              }}
              className={`${
                showAddForm 
                  ? "bg-gray-200 hover:bg-gray-300 text-gray-800 w-8 h-8" 
                  : "bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2"
              } rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                showAddForm ? "focus:ring-gray-500" : "focus:ring-indigo-500"
              } flex items-center justify-center`}
            >
              {showAddForm ? (
                "\u00D7"
              ) : (
                t.addNewUser
              )}
            </button>
            <div id="addUserForm" className="hidden absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-lg p-6 z-10 border border-gray-200">
              <div className="flex justify-between items-center mb-4">
                <h2 className={styles.headings.h2}>{t.addNewUser}</h2>
              </div>
              <form onSubmit={handleNewUserSubmit} className="space-y-3">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                    {t.name}
                  </label>
                  <input
                    type="text"
                    id="name"
                    value={newUser.name}
                    onChange={(e) => setNewUser(prev => ({ ...prev, name: e.target.value }))}
                    placeholder={t.enterFullName}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="birthdate" className="block text-sm font-medium text-gray-700">
                    {t.birthdate} <span className="text-gray-500">({t.optional})</span>
                  </label>
                  <input
                    type="text"
                    id="birthdate"
                    value={newUser.birthdate}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Allow empty value for optional field
                      if (value === '') {
                        setNewUser(prev => ({ ...prev, birthdate: '' }));
                        return;
                      }
                      
                      // Only allow digits and hyphen
                      if (!/^[\d-]*$/.test(value)) return;
                      
                      // Auto-add hyphen after MM
                      let formattedValue = value;
                      if (value.length === 2 && !value.includes('-')) {
                        formattedValue = value + '-';
                      }
                      
                      // Limit to MM-DD format
                      if (formattedValue.length > 5) return;
                      
                      // Validate month and day
                      if (formattedValue.includes('-')) {
                        const [month, day] = formattedValue.split('-');
                        const monthNum = parseInt(month);
                        const dayNum = parseInt(day);
                        
                        if (monthNum < 1 || monthNum > 12) return;
                        if (dayNum < 1 || dayNum > 31) return;
                      }
                      
                      setNewUser(prev => ({ ...prev, birthdate: formattedValue }));
                    }}
                    placeholder={t.birthdateFormat}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                    {t.email}
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                    placeholder={t.enterEmailAddress}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={newUser.isTeacher}
                      onChange={(e) => {
                        const isTeacher = e.target.checked;
                        setNewUser(prev => ({
                          ...prev,
                          isTeacher,
                          // Clear payment config if teacher is selected
                          paymentConfig: isTeacher ? undefined : (prev.isAdmin ? undefined : prev.paymentConfig)
                        }));
                      }}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <span className="text-sm font-medium text-gray-700">{t.teacherAccount}</span>
                  </label>
                </div>
                <div>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={newUser.isAdmin}
                      onChange={(e) => {
                        const isAdmin = e.target.checked;
                        setNewUser(prev => ({
                          ...prev,
                          isAdmin,
                          // Clear payment config if admin is selected
                          paymentConfig: isAdmin ? undefined : (prev.isTeacher ? undefined : prev.paymentConfig)
                        }));
                      }}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <span className="text-sm font-medium text-gray-700">{t.adminAccount}</span>
                  </label>
                </div>
                <button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  {t.generateSignupLink}
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          {showMobileView ? (
            // Mobile card view
            <div className="space-y-4 p-4">
              {allUsers.map(renderMobileCard)}
            </div>
          ) : (
            // Desktop table view
            <div className="relative">
              <div className="table-container overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className={styles.table.header}>
                        {t.name}
                      </th>
                      <th scope="col" className={styles.table.header}>
                        {t.email}
                      </th>
                      <th scope="col" className={`${styles.table.header} text-center`}>
                        {t.userStatus}
                      </th>
                      <th scope="col" className={`${styles.table.header} text-center`}>
                        {t.actions}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {allUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {editingUserId === user.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                className="px-2 py-1 border border-gray-300 rounded text-sm"
                                placeholder={t.enterName}
                              />
                              <button
                                onClick={() => handleUpdateName(user.id)}
                                className="bg-green-500 hover:bg-green-600 text-white px-2 py-1 rounded text-sm"
                              >
                                {t.save}
                              </button>
                              <button
                                onClick={() => {
                                  setEditingUserId(null);
                                  setEditingName('');
                                }}
                                className="bg-gray-500 hover:bg-gray-600 text-white px-2 py-1 rounded text-sm"
                              >
                                {t.cancel}
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              {user.name}
                              {user.status === 'active' && (
                                <PencilIcon
                                  className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-pointer"
                                  title={t.edit}
                                  onClick={() => {
                                    setEditingUserId(user.id);
                                    setEditingName(user.name);
                                  }}
                                />
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{user.email}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          {user.status === 'active' ? (
                            <span className={`inline-flex items-center px-4 py-1 rounded-full text-sm font-medium ${
                              user.isAdmin
                                ? 'bg-green-100 text-green-800'
                                : user.isTeacher
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {user.isAdmin ? 'Admin' : user.isTeacher ? t.teacherAccount : t.activeUser}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-4 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                              {t.pendingSignup}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="flex flex-col items-center space-y-2">
                            {user.status === 'active' && (
                              <button
                                onClick={() => deleteUser(user.id)}
                                className={`${styles.buttons.danger} w-[120px]`}
                              >
                                {t.delete}
                              </button>
                            )}
                            {user.status === 'pending' && (
                              <>
                                <button
                                  onClick={async () => {
                                    try {
                                      let signupLink = recentSignupLinks[user.email];
                                      if (!signupLink) {
                                        signupLink = await createSignupLink(user.email, user.name);
                                        setRecentSignupLinks(prev => ({
                                          ...prev,
                                          [user.email]: signupLink
                                        }));
                                      }
                                      await navigator.clipboard.writeText(signupLink);
                                      toast.success(t.signupLinkCopied);
                                    } catch (error) {
                                      console.error('Error copying signup link:', error);
                                      toast.error(t.failedToCopyLink);
                                    }
                                  }}
                                  className={`${styles.buttons.primary} w-[120px]`}
                                >
                                  {t.copyLink}
                                </button>
                                <button
                                  onClick={() => deleteUser(user.id)}
                                  className={`${styles.buttons.danger} w-[120px]`}
                                >
                                  {t.delete}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {showScrollIndicator && (
                <div className="absolute right-0 top-0 bottom-0 w-12 pointer-events-none bg-gradient-to-l from-white to-transparent flex items-center justify-center">
                  <div className="animate-bounce text-gray-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}; 