import { useState, useEffect, useCallback } from 'react';
import { doc, collection, where } from 'firebase/firestore';
import { db, functions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';
import { createSignupLink } from '../utils/signupLinks';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import { useAdmin } from '../hooks/useAdmin';
import { getCachedCollection, updateCachedDocument, deleteCachedDocument, setCachedDocument } from '../utils/firebaseUtils';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';

interface User {
  id: string;
  uid?: string;  // Firebase Auth UID
  email: string;
  name: string;
  isAdmin: boolean;
  status?: 'active' | 'pending';
  createdAt: string | Date;
  paymentConfig: {
    type: 'weekly' | 'monthly';
    weeklyInterval?: number;  // for weekly payments, number of weeks
    monthlyOption?: 'first' | 'fifteen' | 'last';  // for monthly payments: first day, 15th, or last day
  };
}

interface NewUser {
  email: string;
  name: string;
  paymentConfig: {
    type: 'weekly' | 'monthly';
    weeklyInterval?: number;
    monthlyOption?: 'first' | 'fifteen' | 'last';
  };
}

export const AdminUsers = () => {
  const { currentUser } = useAuth();
  const { isAdmin } = useAdmin();
  const { language } = useLanguage();
  const t = useTranslation(language);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUser, setNewUser] = useState<NewUser>({ 
    email: '', 
    name: '', 
    paymentConfig: { 
      type: 'weekly',
      weeklyInterval: 1 
    } 
  });
  const [recentSignupLinks, setRecentSignupLinks] = useState<{[email: string]: string}>({});

  const fetchUsers = useCallback(async () => {
    try {
      const usersList = await getCachedCollection<User>('users', [], { 
        userId: currentUser?.uid
      });
      // Ensure users default to 'active' if the status field is not present
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
  }, [fetchUsers]);

  const toggleAdmin = async (userId: string, currentStatus: boolean) => {
    try {
      await updateCachedDocument('users', userId, {
        isAdmin: !currentStatus
      });
      await fetchUsers();
      toast.success('User admin status updated');
    } catch (error) {
      console.error('Error updating user:', error);
      toast.error('Failed to update user');
    }
  };

  const deleteUser = async (userId: string) => {
    // Security checks
    if (!currentUser || !isAdmin) {
      toast.error('Unauthorized action');
      return;
    }

    if (userId === currentUser.uid) {
      toast.error('Cannot delete your own account');
      return;
    }

    // Get user details for confirmation
    const userToDelete = users.find(user => user.id === userId);
    if (!userToDelete) {
      toast.error('User not found');
      return;
    }

    console.log('User to delete:', {
      id: userToDelete.id,
      uid: userToDelete.uid,
      email: userToDelete.email,
      name: userToDelete.name
    });

    if (!window.confirm(`Are you sure you want to delete ${userToDelete.name} (${userToDelete.email})?`)) {
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
          // delete from Firebase Auth using our cloud function
          const deleteAuthUserFunc = httpsCallable(functions, 'deleteAuthUser');
          console.log('Attempting to delete user with auth ID:', userToDelete.uid);
          await deleteAuthUserFunc({ userId: userToDelete.uid });
          console.log('Successfully called delete function');
        } else {
          console.log('No Firebase Auth user found - skipping auth deletion');
        }
        
        await deleteCachedDocument('users', userId);
        console.log('Successfully deleted user document');
      } catch (error: unknown) {
        console.error('Error deleting auth user:', error);
        // If there's an error deleting the auth user, we should still try to delete the Firestore document
        try {
          await deleteCachedDocument('users', userId);
          console.log('Successfully deleted user document despite auth deletion error');
        } catch (docError) {
          console.error('Error deleting user document:', docError);
          throw docError; // Re-throw if we can't even delete the document
        }
      }

      await fetchUsers();
      toast.success('User and associated data deleted successfully');
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error('Failed to delete user');
    }
  };

  const handleNewUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.email || !newUser.name) {
      toast.error('Please fill in both name and email');
      return;
    }

    // Validate payment configuration
    if (newUser.paymentConfig.type === 'weekly' && !newUser.paymentConfig.weeklyInterval) {
      toast.error(t.pleaseSpecifyWeeklyInterval);
      return;
    }
    if (newUser.paymentConfig.type === 'monthly' && !newUser.paymentConfig.monthlyOption) {
      toast.error(t.pleaseSelectPaymentDay);
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
      
      // Create a new document reference with a generated ID
      const newDocId = doc(collection(db, 'users')).id;
      
      const newUserData: User = {
        id: newDocId,
        email: newUser.email,
        name: newUser.name,
        isAdmin: false,
        status: 'pending',
        createdAt: new Date().toISOString(),
        paymentConfig: newUser.paymentConfig
      };
      
      // Use setCachedDocument to properly handle caching
      await setCachedDocument('users', newDocId, newUserData, { userId: currentUser?.uid });
      
      // Update local state immediately with the new user
      setUsers(prevUsers => [...prevUsers, newUserData]);
      
      // Copy to clipboard
      await navigator.clipboard.writeText(signupLink);
      
      setNewUser({ email: '', name: '', paymentConfig: { type: 'weekly', weeklyInterval: 1 } }); // Reset form
      
      // Hide the form
      const form = document.getElementById('addUserForm');
      if (form) {
        form.classList.add('hidden');
      }
      
      toast.success('Signup link copied to clipboard!');
    } catch (error) {
      console.error('Error generating signup link:', error);
      toast.error('Failed to generate signup link');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center p-4">Loading...</div>;
  }

  const allUsers = users.sort((a, b) => {
    if (a.isAdmin && !b.isAdmin) return -1;
    if (!a.isAdmin && b.isAdmin) return 1;
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="flex-1 bg-white">
      <div className="py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-black">Manage Users</h1>
          <div className="relative">
            <button
              onClick={() => {
                const form = document.getElementById('addUserForm');
                if (form) {
                  form.classList.toggle('hidden');
                }
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              {t.addNewUser}
            </button>
            <div id="addUserForm" className="hidden absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-lg p-4 z-10 border border-gray-200">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900">{t.addNewUser}</h2>
                <button
                  onClick={() => {
                    const form = document.getElementById('addUserForm');
                    if (form) {
                      form.classList.add('hidden');
                    }
                  }}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <svg className="h-5 w-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                    <path d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
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
                    placeholder="Enter full name"
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    required
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
                    placeholder="Enter email address"
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="paymentConfig" className="block text-sm font-medium text-gray-700">
                    {t.paymentConfiguration}
                  </label>
                  <select
                    id="paymentConfig"
                    value={newUser.paymentConfig.type}
                    onChange={(e) => setNewUser(prev => ({ ...prev, paymentConfig: { ...prev.paymentConfig, type: e.target.value as 'weekly' | 'monthly' } }))}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  {newUser.paymentConfig.type === 'weekly' && (
                    <div>
                      <label htmlFor="weeklyInterval" className="block text-sm font-medium text-gray-700">
                        {t.weeklyInterval}
                      </label>
                      <input
                        type="number"
                        id="weeklyInterval"
                        min="1"
                        max="52"
                        value={newUser.paymentConfig.weeklyInterval || ''}
                        onChange={(e) => setNewUser(prev => ({ 
                          ...prev, 
                          paymentConfig: { 
                            ...prev.paymentConfig, 
                            weeklyInterval: Number(e.target.value) 
                          } 
                        }))}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      />
                    </div>
                  )}
                  {newUser.paymentConfig.type === 'monthly' && (
                    <div>
                      <label htmlFor="monthlyOption" className="block text-sm font-medium text-gray-700">
                        {t.selectPaymentDay}
                      </label>
                      <select
                        id="monthlyOption"
                        value={newUser.paymentConfig.monthlyOption || ''}
                        onChange={(e) => setNewUser(prev => ({ 
                          ...prev, 
                          paymentConfig: { 
                            ...prev.paymentConfig, 
                            monthlyOption: e.target.value as 'first' | 'fifteen' | 'last'
                          } 
                        }))}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      >
                        <option value="">{t.selectPaymentDay}</option>
                        <option value="first">{t.firstDayMonth}</option>
                        <option value="fifteen">{t.fifteenthDayMonth}</option>
                        <option value="last">{t.lastDayMonth}</option>
                      </select>
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  {t.generateSignupLink}
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {allUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{user.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{user.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {user.status === 'active' ? (
                        <button
                          onClick={() => toggleAdmin(user.id, user.isAdmin)}
                          className={`px-4 py-1 text-sm rounded-full ${
                            user.isAdmin
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {user.isAdmin ? 'Admin' : 'User'}
                        </button>
                      ) : (
                        <span className="inline-flex items-center px-4 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                          Pending Signup
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex flex-col justify-center items-center space-y-2">
                        {user.status === 'active' && (
                          <button
                            onClick={() => deleteUser(user.id)}
                            className="w-24 bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
                          >
                            Delete
                          </button>
                        )}
                        {user.status === 'pending' && (
                          <>
                            <button
                              onClick={async () => {
                                try {
                                  // Check if we have a recent signup link for this email
                                  let signupLink = recentSignupLinks[user.email];
                                  
                                  // If not, create a new one and update the user's token
                                  if (!signupLink) {
                                    // Create new signup link
                                    signupLink = await createSignupLink(user.email, user.name);
                                    
                                    // Update recent signup links state
                                    setRecentSignupLinks(prev => ({
                                      ...prev,
                                      [user.email]: signupLink
                                    }));
                                  }
                                  
                                  await navigator.clipboard.writeText(signupLink);
                                  toast.success('Signup link copied to clipboard!');
                                } catch (error) {
                                  console.error('Error copying signup link:', error);
                                  toast.error('Failed to copy signup link');
                                }
                              }}
                              className="w-24 bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded text-sm"
                            >
                              Copy Link
                            </button>
                            <button
                              onClick={() => deleteUser(user.id)}
                              className="w-24 bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
                            >
                              Delete
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
        </div>
      </div>
    </div>
  );
}; 