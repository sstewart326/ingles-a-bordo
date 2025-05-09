import { useState, useEffect, useCallback } from 'react';
import { doc, collection, where } from 'firebase/firestore';
import { db, functions } from '../config/firebase';
import { getAuth } from 'firebase/auth';
import { createSignupLink, extendSignupTokenExpiration } from '../utils/signupLinks';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import { useAdmin } from '../hooks/useAdmin';
import { useMasquerade } from '../hooks/useMasquerade';
import {
  getCachedCollection,
  deleteCachedDocument,
  setCachedDocument,
  updateCachedDocument,
  getTeacherUsers,
  getUsersClasses
} from '../utils/firebaseUtils';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { PencilIcon, InformationCircleIcon, TrashIcon } from '@heroicons/react/24/outline';
import { styles } from '../styles/styleUtils';
import Modal from '../components/Modal';
import { User } from '../types/interfaces';
import { useNavigate } from 'react-router-dom';
import { Tooltip } from '../components/Tooltip';

interface NewUser {
  email: string;
  name: string;
  isTeacher: boolean;
  isAdmin: boolean;
  birthdate?: string;  // Optional birthdate field
  teacher?: string;  // ID of the admin who created this user
  paymentConfig?: {
    type: 'weekly' | 'monthly';
    weeklyInterval?: number;
    monthlyOption?: 'first' | 'fifteen' | 'last';
    startDate: string;
    paymentLink?: string;
  };
}

interface SignupLinkData {
  signupLink: string;
  token: string;
}

interface ExtendedUser extends User {
  isAdmin: boolean;
  isTeacher: boolean;
}

const logUserOp = (message: string, data?: any) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[ADMIN-USERS] ${message}`, data ? data : '');
  }
};

export const AdminUsers = () => {
  const { currentUser } = useAuth() as { currentUser: ExtendedUser | null };
  const { isAdmin } = useAdmin();
  const { startMasquerade } = useMasquerade();
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
    birthdate: '',  // Initialize birthdate field
    teacher: undefined  // Initialize teacher field
  });
  const [recentSignupLinks, setRecentSignupLinks] = useState<{ [email: string]: SignupLinkData }>({});
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingBirthdate, setEditingBirthdate] = useState('');
  const [editingField, setEditingField] = useState<'name' | 'birthdate' | null>(null);
  const [updatingName, setUpdatingName] = useState(false);
  const [updatingBirthdate, setUpdatingBirthdate] = useState(false);
  const navigate = useNavigate();

  const fetchUsers = useCallback(async () => {
    if (!currentUser?.uid) {
      setLoading(false);
      return;
    }

    try {
      let usersList: User[] = [];
      if (isAdmin) {
        logUserOp('Fetching all users as admin', { userId: currentUser?.uid });
        // If admin, get all users - bypass cache to get fresh data
        usersList = await getCachedCollection<User>('users', [], {
          userId: currentUser?.uid,
          bypassCache: true  // Force fresh data fetch
        });
        logUserOp('Admin users query result', { count: usersList.length });
      } else {
        logUserOp('Fetching teacher users', { teacherAuthId: currentUser.uid });
        // If teacher, only get their students - bypass cache
        usersList = await getTeacherUsers<User>(currentUser.uid, {
          userId: currentUser?.uid,
          bypassCache: true  // Force fresh data fetch
        });
        logUserOp('Teacher users query result', { count: usersList.length });
      }

      const updatedUsersList = usersList.map(user => ({
        ...user,
        status: user.status === 'pending' ? 'pending' : 'active'
      })) as User[];

      // If teacher, also fetch all classes for these users
      if (!isAdmin && updatedUsersList.length > 0) {
        const userEmails = updatedUsersList.map(user => user.email);
        logUserOp('Fetching classes for users', { userCount: userEmails.length });
        const classes = await getUsersClasses(userEmails, {
          userId: currentUser?.uid,
          bypassCache: true  // Force fresh data fetch
        });
        logUserOp('Classes query result', { classCount: classes.length });
      }

      setUsers(updatedUsersList);
    } catch (error) {
      console.error('Error fetching users:', error);
      logUserOp('Error in fetchUsers', { error });
      toast.error(t.failedToFetchUsers);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.uid, isAdmin, t]);

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
    // IMPORTANT: This function handles deletion of a user. When deleting a user:
    // 1. We must NOT delete classes that have other students - only remove the deleted user from them
    // 2. We must NOT delete class materials that other students use - only remove the deleted user
    // 3. Only delete materials and classes that are exclusively used by this student
    // Failure to follow these rules can result in accidental data loss

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

    logUserOp('User to delete:', { email: userToDelete.email, uid: userToDelete.uid });

    const userType = userToDelete.isAdmin ? 'admin' : userToDelete.isTeacher ? 'teacher' : 'student';
    const confirmMessage = `Are you sure you want to delete ${userToDelete.name} (${userToDelete.email})?\n\nThis will permanently delete this ${userType}'s account and remove them from all associated classes.\n\nThis action cannot be undone.`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      // Update UI state immediately to show the deletion
      setUsers(prevUsers => prevUsers.filter(user => user.id !== userId));

      // Get all classes where this user is enrolled as a student
      // We will update these classes to remove the student, not delete them
      const userClasses = await getCachedCollection<{ id: string, studentEmails: string[] }>('classes', [
        where('studentEmails', 'array-contains', userToDelete.email)
      ], {
        userId: currentUser.uid,
        bypassCache: true
      });

      // For each class, get and update associated materials
      for (const classDoc of userClasses) {
        const classMaterials = await getCachedCollection<{ id: string, studentEmails: string[] }>('classMaterials', [
          where('classId', '==', classDoc.id),
          where('studentEmails', 'array-contains', userToDelete.email)
        ], {
          userId: currentUser.uid,
          bypassCache: true
        });

        // Update or delete each material document based on whether other students are using it
        for (const material of classMaterials) {
          if (material.studentEmails.length <= 1) {
            // If this is the only student using this material, delete it
            await deleteCachedDocument('classMaterials', material.id);
          } else {
            // If other students are using this material, just remove this student
            await updateCachedDocument('classMaterials', material.id, {
              studentEmails: material.studentEmails.filter(email => email !== userToDelete.email)
            }, {
              userId: currentUser.uid
            });
          }
        }

        // Update the class to remove this student instead of deleting the whole class
        // Only remove the student from the class, not delete the entire class
        await updateCachedDocument('classes', classDoc.id, {
          studentEmails: classDoc.studentEmails.filter(email => email !== userToDelete.email)
        }, {
          userId: currentUser.uid
        });
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
          logUserOp('Attempting to delete user with auth ID:', userToDelete.uid);

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
          logUserOp('Delete auth user function result:', result);
          logUserOp('Successfully called delete function');
        } else {
          logUserOp('No Firebase Auth user found - skipping auth deletion');
        }

        await deleteCachedDocument('users', userId);
        logUserOp('Successfully deleted user document');
      } catch (error: unknown) {
        logUserOp('Error in delete process:', {
          error,
          message: error instanceof Error ? error.message : 'Unknown error'
        });

        // If there was an error, refresh the UI to restore the original state
        await fetchUsers();

        throw error;
      }

      // Don't refresh the users in the background - it can cause stale data to reappear
      // The UI is already updated through setUsers() earlier, and the cache is invalidated

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
      // Normalize email to lowercase
      const normalizedEmail = newUser.email.toLowerCase();
      const signupLinkData = await createSignupLink(normalizedEmail, newUser.name);

      // Store the signup link
      setRecentSignupLinks(prev => ({
        ...prev,
        [normalizedEmail]: signupLinkData
      }));

      // Create a new document with a temporary ID that includes 'pending_' prefix
      const tempId = `${doc(collection(db, 'users')).id}`;

      const newUserData: User = {
        id: tempId,
        email: normalizedEmail,
        name: newUser.name,
        isAdmin: newUser.isAdmin,
        isTeacher: newUser.isTeacher,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      // Only add birthdate field if it's not empty
      if (newUser.birthdate && newUser.birthdate.trim() !== '') {
        newUserData.birthdate = newUser.birthdate.trim();
      }

      // Set the teacher field to the current admin's ID if the user is not an admin or teacher
      if (!newUser.isAdmin && !newUser.isTeacher && currentUser?.uid) {
        newUserData.teacher = currentUser.uid;
      }

      // Use setCachedDocument to properly handle caching
      await setCachedDocument('users', tempId, newUserData, { userId: currentUser?.uid });

      // Force a full refresh of the users collection
      // This will ensure the cache is updated properly
      await fetchUsers();

      // Copy to clipboard
      await navigator.clipboard.writeText(signupLinkData.signupLink);

      setNewUser({
        email: '',
        name: '',
        isTeacher: false,
        isAdmin: false,
        birthdate: '',  // Reset birthdate field
        teacher: undefined  // Reset teacher field
      }); // Reset form

      // Close the modal
      setShowAddForm(false);

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

      // Set loading state to true
      setUpdatingName(true);

      await updateCachedDocument('users', userId, {
        name: editingName.trim(),
        updatedAt: new Date().toISOString()
      }, { userId: currentUser.uid });

      await fetchUsers();
      setEditingUserId(null);
      setEditingField(null);
      setEditingName('');
      toast.success(t.nameUpdated);
    } catch (error) {
      console.error('Error updating user name:', error);
      toast.error(t.failedToUpdateName);
    } finally {
      // Set loading state back to false
      setUpdatingName(false);
    }
  };

  const handleUpdateBirthdate = async (userId: string) => {
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

      // Set loading state to true
      setUpdatingBirthdate(true);

      // Create update object
      const updateData: any = {
        updatedAt: new Date().toISOString()
      };

      // Only add birthdate field if it's not empty
      if (editingBirthdate.trim() !== '') {
        updateData.birthdate = editingBirthdate.trim();
      } else {
        // If birthdate is empty and the user had a birthdate before,
        // we need to remove it using Firebase's field deletion
        // For now, we'll just set it to null which Firestore accepts
        updateData.birthdate = null;
      }

      await updateCachedDocument('users', userId, updateData, { userId: currentUser.uid });

      await fetchUsers();
      setEditingUserId(null);
      setEditingField(null);
      setEditingBirthdate('');
      toast.success(t.birthdateUpdated);
    } catch (error) {
      console.error('Error updating user birthdate:', error);
      toast.error(t.failedToUpdateBirthdate);
    } finally {
      // Set loading state back to false
      setUpdatingBirthdate(false);
    }
  };

  if (loading) {
    return <div className="text-center p-4">{t.loading}</div>;
  }

  const allUsers = users
    .filter(user => !user.isAdmin) // Filter out admin users
    .sort((a, b) => {
      // First sort by status (pending first)
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;

      // Then sort alphabetically by name
      // Split names to get first and last names
      const aParts = a.name.trim().split(' ');
      const bParts = b.name.trim().split(' ');

      // Compare first names first
      const aFirstName = aParts[0].toLowerCase();
      const bFirstName = bParts[0].toLowerCase();

      if (aFirstName !== bFirstName) {
        return aFirstName.localeCompare(bFirstName);
      }

      // If first names are the same, compare full names
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

  const renderMobileCard = (user: User) => (
    <div key={user.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
      <div className="flex justify-between items-start mb-3">
        <div>
          {editingUserId === user.id && editingField === 'name' ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                  placeholder={t.enterName}
                  disabled={updatingName}
                />
                <button
                  onClick={() => handleUpdateName(user.id)}
                  className={`${updatingName ? 'bg-green-400' : 'bg-green-500 hover:bg-green-600'} text-white px-2 py-1 rounded text-sm flex items-center justify-center min-w-[40px]`}
                  disabled={updatingName}
                >
                  {updatingName ? (
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    t.save
                  )}
                </button>
                <button
                  onClick={() => {
                    setEditingUserId(null);
                    setEditingField(null);
                    setEditingName('');
                  }}
                  className="bg-gray-500 hover:bg-gray-600 text-white px-2 py-1 rounded text-sm"
                  disabled={updatingName}
                >
                  {t.cancel}
                </button>
              </div>
            </div>
          ) : editingUserId === user.id && editingField === 'birthdate' ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editingBirthdate}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Allow empty value for optional field
                    if (value === '') {
                      setEditingBirthdate('');
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

                    setEditingBirthdate(formattedValue);
                  }}
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                  placeholder={t.birthdateFormat}
                  disabled={updatingBirthdate}
                />
                <button
                  onClick={() => handleUpdateBirthdate(user.id)}
                  className={`${updatingBirthdate ? 'bg-green-400' : 'bg-green-500 hover:bg-green-600'} text-white px-2 py-1 rounded text-sm flex items-center justify-center min-w-[40px]`}
                  disabled={updatingBirthdate}
                >
                  {updatingBirthdate ? (
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    t.save
                  )}
                </button>
                <button
                  onClick={() => {
                    setEditingUserId(null);
                    setEditingField(null);
                    setEditingBirthdate('');
                  }}
                  className="bg-gray-500 hover:bg-gray-600 text-white px-2 py-1 rounded text-sm"
                  disabled={updatingBirthdate}
                >
                  {t.cancel}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="font-semibold text-gray-900 flex items-center gap-2">
                {user.name}
                <PencilIcon
                  className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-pointer"
                  title={t.edit}
                  onClick={() => {
                    setEditingUserId(user.id);
                    setEditingField('name');
                    setEditingName(user.name);
                  }}
                />
              </div>
              <div className="text-sm text-gray-600 flex items-center gap-1">
                <div className="flex items-center gap-1">
                  {user.email}
                  <div className="relative inline-block">
                    <InformationCircleIcon
                      className="h-4 w-4 text-gray-400 cursor-help hover:text-gray-600"
                      onMouseOver={() => {
                        const tooltip = document.getElementById(`email-tooltip-mobile-${user.id}`);
                        if (tooltip) tooltip.classList.add('opacity-100');
                      }}
                      onMouseOut={() => {
                        const tooltip = document.getElementById(`email-tooltip-mobile-${user.id}`);
                        if (tooltip) tooltip.classList.remove('opacity-100');
                      }}
                    />
                    <div
                      id={`email-tooltip-mobile-${user.id}`}
                      className="absolute pointer-events-none opacity-0 top-full left-1/2 transform -translate-x-1/2 mt-2 w-72 max-w-[calc(100vw-40px)] p-3 bg-gray-800 text-white text-xs rounded shadow-lg transition-opacity duration-200 z-[100] whitespace-normal text-center"
                    >
                      {t.emailNotEditable}
                      <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 rotate-45 w-2 h-2 bg-gray-800"></div>
                    </div>
                  </div>
                </div>
              </div>
              {user.birthdate && (
                <div className="text-sm text-gray-600 flex items-center gap-2">
                  {t.birthdate}: {user.birthdate}
                  <PencilIcon
                    className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-pointer"
                    title={t.edit}
                    onClick={() => {
                      setEditingUserId(user.id);
                      setEditingField('birthdate');
                      setEditingBirthdate(user.birthdate || '');
                    }}
                  />
                </div>
              )}
              {!user.birthdate && (
                <div className="text-sm text-gray-600 flex items-center gap-2">
                  {t.birthdate}: -
                  <PencilIcon
                    className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-pointer"
                    title={t.edit}
                    onClick={() => {
                      setEditingUserId(user.id);
                      setEditingField('birthdate');
                      setEditingBirthdate('');
                    }}
                  />
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          {user.status === 'active' ? (
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${user.isAdmin
                ? 'bg-green-100 text-green-800'
                : user.isTeacher
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-gray-100 text-gray-800'
              }`}>
              {user.isAdmin ? 'Admin' : user.isTeacher ? t.teacherAccount : t.activeUser}
            </span>
          ) : (
            <span 
              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 cursor-pointer hover:bg-yellow-200 transition-colors duration-200"
              onClick={async () => {
                try {
                  let signupLinkData = recentSignupLinks[user.email];
                  if (!signupLinkData) {
                    signupLinkData = await createSignupLink(user.email, user.name);
                    setRecentSignupLinks(prev => ({
                      ...prev,
                      [user.email]: signupLinkData
                    }));
                  } else {
                    // Extend the expiration date
                    await extendSignupTokenExpiration(signupLinkData.token);
                  }
                  await navigator.clipboard.writeText(signupLinkData.signupLink);
                  toast.success(t.signupLinkCopied);
                } catch (error) {
                  console.error('Error copying signup link:', error);
                  toast.error(t.failedToCopyLink);
                }
              }}
              title={t.copySignupLink}
            >
              {t.pendingSignup}
            </span>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-4">
        {user.status === 'active' ? (
          <>
            {!user.isAdmin && (
              <div className="relative">
                <Tooltip text="Impersonate" width="w-28">
                  <button
                    onClick={async () => {
                      try {
                        await startMasquerade(user.id);
                        toast.success(`Now viewing as ${user.name || user.email}`);
                        navigate('/schedule');
                      } catch (error) {
                        console.error('Error starting masquerade:', error);
                        toast.error('Failed to masquerade as user');
                      }
                    }}
                    className="p-1.5 text-indigo-600 hover:text-indigo-800 rounded-full hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 relative group/button"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span className="sr-only">Impersonate</span>
                    <span className="absolute bottom-full left-0 mb-1 px-3 py-2 w-28 bg-gray-800 text-white text-sm rounded-md shadow-lg opacity-0 invisible group-hover/button:opacity-100 group-hover/button:visible transition-all duration-200 z-[100] pointer-events-none whitespace-nowrap">
                      Impersonate
                      <span className="absolute w-2 h-2 bg-gray-800 transform rotate-45 left-4 -bottom-1"></span>
                    </span>
                  </button>
                </Tooltip>
              </div>
            )}
            <div className="relative">
              <Tooltip text={t.delete} width="w-20">
                <button
                  onClick={() => deleteUser(user.id)}
                  className="p-1.5 rounded-full text-red-600 hover:text-red-800 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 relative group/button"
                >
                  <TrashIcon className="h-4 w-4" />
                  <span className="sr-only">{t.delete}</span>
                  <span className="absolute bottom-full left-0 mb-1 px-3 py-2 w-20 bg-gray-800 text-white text-sm rounded-md shadow-lg opacity-0 invisible group-hover/button:opacity-100 group-hover/button:visible transition-all duration-200 z-[100] pointer-events-none whitespace-nowrap">
                    {t.delete}
                    <span className="absolute w-2 h-2 bg-gray-800 transform rotate-45 left-4 -bottom-1"></span>
                  </span>
                </button>
              </Tooltip>
            </div>
          </>
        ) : (
          <>
            <div className="relative">
              <Tooltip text={t.signup} width="w-24">
                <button
                  onClick={async () => {
                    try {
                      let signupLinkData = recentSignupLinks[user.email];
                      if (!signupLinkData) {
                        signupLinkData = await createSignupLink(user.email, user.name);
                        setRecentSignupLinks(prev => ({
                          ...prev,
                          [user.email]: signupLinkData
                        }));
                      } else {
                        // Extend the expiration date
                        await extendSignupTokenExpiration(signupLinkData.token);
                      }
                      await navigator.clipboard.writeText(signupLinkData.signupLink);
                      toast.success(t.signupLinkCopied);
                    } catch (error) {
                      console.error('Error copying signup link:', error);
                      toast.error(t.failedToCopyLink);
                    }
                  }}
                  className="p-1.5 text-indigo-600 hover:text-indigo-800 rounded-full hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 relative group/button"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span className="sr-only">{t.copyLink}</span>
                  <div className="absolute bottom-full right-0 mb-1 w-72 max-w-[calc(100vw-40px)] p-3 bg-gray-800 text-white text-xs rounded shadow-lg opacity-0 group-hover/button:opacity-100 transition-opacity duration-200 z-[100] pointer-events-none whitespace-normal text-center">
                    {t.signupLinkExpires}
                    <div className="absolute bottom-0 right-[8px] transform translate-y-1/2 rotate-45 w-2 h-2 bg-gray-800"></div>
                  </div>
                </button>
              </Tooltip>
            </div>
            <div className="relative">
              <Tooltip text={t.delete} width="w-20">
                <button
                  onClick={() => deleteUser(user.id)}
                  className="p-1.5 rounded-full text-red-600 hover:text-red-800 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                >
                  <TrashIcon className="h-4 w-4" />
                  <span className="sr-only">{t.delete}</span>
                </button>
              </Tooltip>
            </div>
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
              onClick={() => setShowAddForm(!showAddForm)}
              className={`${showAddForm
                  ? "bg-gray-200 hover:bg-gray-300 text-gray-800 w-8 h-8"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2"
                } rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${showAddForm ? "focus:ring-gray-500" : "focus:ring-indigo-500"
                } flex items-center justify-center`}
            >
              {showAddForm ? (
                "\u00D7"
              ) : (
                t.addNewUser
              )}
            </button>
            <Modal isOpen={showAddForm} onClose={() => setShowAddForm(false)}>
              <div className="w-96">
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
                          setNewUser(prev => ({ ...prev, birthdate: value }));
                          return;
                        }

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
                    <p className="mt-1 text-xs text-gray-500">
                      {t.birthdateFormat}
                    </p>
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
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="isTeacher"
                      checked={newUser.isTeacher}
                      onChange={(e) => setNewUser(prev => ({ ...prev, isTeacher: e.target.checked }))}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <label htmlFor="isTeacher" className="ml-2 block text-sm text-gray-900">
                      {t.teacherAccount}
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="isAdmin"
                      checked={newUser.isAdmin}
                      onChange={(e) => setNewUser(prev => ({ ...prev, isAdmin: e.target.checked }))}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <label htmlFor="isAdmin" className="ml-2 block text-sm text-gray-900">
                      {t.adminAccount}
                    </label>
                  </div>
                  <div className="pt-3">
                    <button
                      type="submit"
                      className={`${styles.buttons.primary} w-full`}
                    >
                      {t.generateSignupLink}
                    </button>
                  </div>
                </form>
              </div>
            </Modal>
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
              <div className="hidden md:flex justify-end mb-2">
                <div className="text-sm text-gray-500 flex items-center pr-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  Scroll horizontally to see all columns
                </div>
              </div>
              {/* Left fade indicator */}
              <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none hidden md:block"></div>

              <div className="table-container overflow-x-auto overflow-y-auto max-h-[600px] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-400 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-gray-500">
                <table className="min-w-full divide-y divide-gray-200 table-fixed">
                  <thead className="bg-gray-50 sticky top-0 z-20 shadow-sm">
                    <tr>
                      <th scope="col" className={`${styles.table.header} w-20`}>
                        {/* Action buttons */}
                      </th>
                      <th scope="col" className={`${styles.table.header} w-1/4`}>
                        {t.name}
                      </th>
                      <th scope="col" className={`${styles.table.header} w-1/4`}>
                        {t.email}
                      </th>
                      <th scope="col" className={`${styles.table.header} w-1/6`}>
                        {t.birthdate}
                      </th>
                      <th scope="col" className={`${styles.table.header} text-center w-1/6`}>
                        {t.userStatus}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {allUsers.map((user) => (
                      <tr key={user.id} className="group hover:bg-gray-50">
                        <td className={`${styles.table.cell} w-20 relative`}>
                          <div className="flex items-center justify-start gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            {user.status === 'active' ? (
                              <>
                                {!user.isAdmin && (
                                  <div className="relative">
                                    <button
                                      onClick={async () => {
                                        try {
                                          await startMasquerade(user.id);
                                          toast.success(`Now viewing as ${user.name || user.email}`);
                                          navigate('/schedule');
                                        } catch (error) {
                                          console.error('Error starting masquerade:', error);
                                          toast.error('Failed to masquerade as user');
                                        }
                                      }}
                                      className="p-1.5 text-indigo-600 hover:text-indigo-800 rounded-full hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 relative group/button"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                      </svg>
                                      <span className="sr-only">Impersonate</span>
                                      <span className="absolute bottom-full left-0 mb-1 px-3 py-2 w-28 bg-gray-800 text-white text-sm rounded-md shadow-lg opacity-0 invisible group-hover/button:opacity-100 group-hover/button:visible transition-all duration-200 z-[100] pointer-events-none whitespace-nowrap">
                                        Impersonate
                                        <span className="absolute w-2 h-2 bg-gray-800 transform rotate-45 left-4 -bottom-1"></span>
                                      </span>
                                    </button>
                                  </div>
                                )}
                                <div className="relative">
                                  <button
                                    onClick={() => deleteUser(user.id)}
                                    className="p-1.5 rounded-full text-red-600 hover:text-red-800 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 relative group/button"
                                  >
                                    <TrashIcon className="h-4 w-4" />
                                    <span className="sr-only">{t.delete}</span>
                                    <span className="absolute bottom-full left-0 mb-1 px-3 py-2 w-20 bg-gray-800 text-white text-sm rounded-md shadow-lg opacity-0 invisible group-hover/button:opacity-100 group-hover/button:visible transition-all duration-200 z-[100] pointer-events-none whitespace-nowrap">
                                      {t.delete}
                                      <span className="absolute w-2 h-2 bg-gray-800 transform rotate-45 left-4 -bottom-1"></span>
                                    </span>
                                  </button>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="relative">
                                  <button
                                    onClick={async () => {
                                      try {
                                        let signupLinkData = recentSignupLinks[user.email];
                                        if (!signupLinkData) {
                                          signupLinkData = await createSignupLink(user.email, user.name);
                                          setRecentSignupLinks(prev => ({
                                            ...prev,
                                            [user.email]: signupLinkData
                                          }));
                                        } else {
                                          // Extend the expiration date
                                          await extendSignupTokenExpiration(signupLinkData.token);
                                        }
                                        await navigator.clipboard.writeText(signupLinkData.signupLink);
                                        toast.success(t.signupLinkCopied);
                                      } catch (error) {
                                        console.error('Error copying signup link:', error);
                                        toast.error(t.failedToCopyLink);
                                      }
                                    }}
                                    className="p-1.5 text-indigo-600 hover:text-indigo-800 rounded-full hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 relative group/button"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                    <span className="sr-only">{t.signup}</span>
                                    <span className="absolute bottom-full left-0 mb-1 px-3 py-2 w-20 bg-gray-800 text-white text-sm rounded-md shadow-lg opacity-0 invisible group-hover/button:opacity-100 group-hover/button:visible transition-all duration-200 z-[100] pointer-events-none whitespace-nowrap">
                                      {t.signup}
                                      <span className="absolute w-2 h-2 bg-gray-800 transform rotate-45 left-4 -bottom-1"></span>
                                    </span>
                                  </button>
                                </div>
                                <div className="relative">
                                  <button
                                    onClick={() => deleteUser(user.id)}
                                    className="p-1.5 rounded-full text-red-600 hover:text-red-800 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 relative group/button"
                                  >
                                    <TrashIcon className="h-4 w-4" />
                                    <span className="sr-only">{t.delete}</span>
                                    <span className="absolute bottom-full left-0 mb-1 px-3 py-2 w-20 bg-gray-800 text-white text-sm rounded-md shadow-lg opacity-0 invisible group-hover/button:opacity-100 group-hover/button:visible transition-all duration-200 z-[100] pointer-events-none whitespace-nowrap">
                                      {t.delete}
                                      <span className="absolute w-2 h-2 bg-gray-800 transform rotate-45 left-4 -bottom-1"></span>
                                    </span>
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {editingUserId === user.id && editingField === 'name' ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                className="px-2 py-1 border border-gray-300 rounded text-sm"
                                placeholder={t.enterName}
                                disabled={updatingName}
                              />
                              <button
                                onClick={() => handleUpdateName(user.id)}
                                className={`${updatingName ? 'bg-green-400' : 'bg-green-500 hover:bg-green-600'} text-white px-2 py-1 rounded text-sm flex items-center justify-center min-w-[40px]`}
                                disabled={updatingName}
                              >
                                {updatingName ? (
                                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                ) : (
                                  t.save
                                )}
                              </button>
                              <button
                                onClick={() => {
                                  setEditingUserId(null);
                                  setEditingField(null);
                                  setEditingName('');
                                }}
                                className="bg-gray-500 hover:bg-gray-600 text-white px-2 py-1 rounded text-sm"
                                disabled={updatingName}
                              >
                                {t.cancel}
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              {user.name}
                              <PencilIcon
                                className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-pointer"
                                title={t.edit}
                                onClick={() => {
                                  setEditingUserId(user.id);
                                  setEditingField('name');
                                  setEditingName(user.name);
                                }}
                              />
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div className="flex items-center gap-1">
                            {user.email}
                            <div className="relative inline-block">
                              <InformationCircleIcon
                                className="h-4 w-4 text-gray-400 cursor-help hover:text-gray-600"
                                onMouseOver={() => {
                                  const tooltip = document.getElementById(`email-tooltip-desktop-${user.id}`);
                                  if (tooltip) tooltip.classList.add('opacity-100');
                                }}
                                onMouseOut={() => {
                                  const tooltip = document.getElementById(`email-tooltip-desktop-${user.id}`);
                                  if (tooltip) tooltip.classList.remove('opacity-100');
                                }}
                              />
                              <div
                                id={`email-tooltip-desktop-${user.id}`}
                                className="absolute pointer-events-none opacity-0 top-full left-1/2 transform -translate-x-1/2 mt-2 w-72 max-w-[calc(100vw-40px)] p-3 bg-gray-800 text-white text-xs rounded shadow-lg transition-opacity duration-200 z-[100] whitespace-normal text-center"
                              >
                                {t.emailNotEditable}
                                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 rotate-45 w-2 h-2 bg-gray-800"></div>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {editingUserId === user.id && editingField === 'birthdate' ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editingBirthdate}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  // Allow empty value for optional field
                                  if (value === '') {
                                    setEditingBirthdate('');
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

                                  setEditingBirthdate(formattedValue);
                                }}
                                className="px-2 py-1 border border-gray-300 rounded text-sm"
                                placeholder={t.birthdateFormat}
                                disabled={updatingBirthdate}
                              />
                              <button
                                onClick={() => handleUpdateBirthdate(user.id)}
                                className={`${updatingBirthdate ? 'bg-green-400' : 'bg-green-500 hover:bg-green-600'} text-white px-2 py-1 rounded text-sm flex items-center justify-center min-w-[40px]`}
                                disabled={updatingBirthdate}
                              >
                                {updatingBirthdate ? (
                                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                ) : (
                                  t.save
                                )}
                              </button>
                              <button
                                onClick={() => {
                                  setEditingUserId(null);
                                  setEditingField(null);
                                  setEditingBirthdate('');
                                }}
                                className="bg-gray-500 hover:bg-gray-600 text-white px-2 py-1 rounded text-sm"
                                disabled={updatingBirthdate}
                              >
                                {t.cancel}
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              {user.birthdate || '-'}
                              <PencilIcon
                                className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-pointer"
                                title={t.edit}
                                onClick={() => {
                                  setEditingUserId(user.id);
                                  setEditingField('birthdate');
                                  setEditingBirthdate(user.birthdate || '');
                                }}
                              />
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          {user.status === 'active' ? (
                            <span className={`inline-flex items-center px-4 py-1 rounded-full text-sm font-medium ${user.isAdmin
                                ? 'bg-green-100 text-green-800'
                                : user.isTeacher
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                              {user.isAdmin ? 'Admin' : user.isTeacher ? t.teacherAccount : t.activeUser}
                            </span>
                          ) : (
                            <span 
                              className="inline-flex items-center px-4 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800 cursor-pointer hover:bg-yellow-200 transition-colors duration-200"
                              onClick={async () => {
                                try {
                                  let signupLinkData = recentSignupLinks[user.email];
                                  if (!signupLinkData) {
                                    signupLinkData = await createSignupLink(user.email, user.name);
                                    setRecentSignupLinks(prev => ({
                                      ...prev,
                                      [user.email]: signupLinkData
                                    }));
                                  } else {
                                    // Extend the expiration date
                                    await extendSignupTokenExpiration(signupLinkData.token);
                                  }
                                  await navigator.clipboard.writeText(signupLinkData.signupLink);
                                  toast.success(t.signupLinkCopied);
                                } catch (error) {
                                  console.error('Error copying signup link:', error);
                                  toast.error(t.failedToCopyLink);
                                }
                              }}
                              title={t.copySignupLink}
                            >
                              {t.pendingSignup}
                            </span>
                          )}
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