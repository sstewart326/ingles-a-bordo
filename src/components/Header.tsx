import { useState, useEffect } from 'react';
import { Disclosure } from '@headlessui/react';
import { Bars3Icon, XMarkIcon, UserCircleIcon } from '@heroicons/react/24/outline';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuthWithMasquerade } from '../hooks/useAuthWithMasquerade';
import { useAdmin } from '../hooks/useAdmin';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import '../styles/header-enhancements.css';

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, logout, isMasquerading } = useAuthWithMasquerade();
  const { isAdmin } = useAdmin();
  const { language } = useLanguage();
  const t = useTranslation(language);
  
  // Add state to control dropdown visibility
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(null);
  
  // Set up real-time listener for profile picture changes
  useEffect(() => {
    if (!currentUser) {
      setProfilePictureUrl(null);
      return;
    }

    // Create a real-time listener for the user's profile document
    const q = query(
      collection(db, 'users'),
      where('uid', '==', currentUser.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty) {
          const userData = snapshot.docs[0].data();
          setProfilePictureUrl(userData.profilePictureUrl || null);
        } else {
          setProfilePictureUrl(null);
        }
      },
      (error) => {
        console.error('Error listening to profile picture changes:', error);
        setProfilePictureUrl(null);
      }
    );

    // Cleanup listener on unmount or when currentUser changes
    return () => unsubscribe();
  }, [currentUser]);
  
  // Toggle the profile menu
  const toggleProfileMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsProfileMenuOpen(!isProfileMenuOpen);
  };

  // Close menu when clicking elsewhere
  useEffect(() => {
    const handleClickOutside = () => {
      setIsProfileMenuOpen(false);
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out:', error);
    }
  };

  // When masquerading, show student navigation regardless of admin status
  const showAdminNav = isAdmin && !isMasquerading;

  const navigation = [
    ...(showAdminNav ? [
      { name: t.home, href: '/dashboard', current: location.pathname === '/dashboard' },
      { name: t.manageUsers, href: '/admin/users', current: location.pathname === '/admin/users' },
      { name: t.manageSchedules, href: '/admin/schedule', current: location.pathname === '/admin/schedule' },
      { name: t.contentLibrary, href: '/admin/content-library', current: location.pathname === '/admin/content-library' },
      { name: t.classPlans, href: '/admin/class-plans', current: location.pathname === '/admin/class-plans' },
      { name: t.paymentsDue, href: '/admin/payments', current: location.pathname === '/admin/payments' }
    ] : [
      { name: t.schedule, href: '/schedule', current: location.pathname === '/schedule' },
      { name: t.myContent, href: '/my-content', current: location.pathname === '/my-content' }
    ])
  ];

  const dashboardPath = showAdminNav ? '/dashboard' : '/schedule';

  return (
    <Disclosure as="nav" className="header-nav">
      {({ open, close }) => (
        <>
          <div className="container mx-auto px-4">
            <div className="relative flex items-center justify-between h-14">
              <div className="absolute inset-y-0 left-0 flex items-center sm:hidden">
                <Disclosure.Button 
                  className="header-nav-button inline-flex items-center justify-center rounded-md p-2 text-[var(--brand-color)] hover:text-[var(--brand-color-dark)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--brand-color)]"
                  style={{ backgroundColor: 'transparent', boxShadow: 'none' }}
                >
                  <span className="sr-only">Open main menu</span>
                  {open ? (
                    <XMarkIcon className="block h-6 w-6 text-[var(--brand-color)] hover:text-[var(--brand-color-dark)]" aria-hidden="true" />
                  ) : (
                    <Bars3Icon className="block h-6 w-6" aria-hidden="true" />
                  )}
                </Disclosure.Button>
              </div>
              <div className="flex-1 flex items-center justify-center sm:items-stretch sm:justify-start">
                <div className="flex-shrink-0 flex items-center ml-8 sm:ml-0">
                  <Link to={dashboardPath} className="flex justify-center items-center">
                    <img
                      src="/IAB_white.png"
                      alt="Inglês a Bordo"
                      className="header-nav-logo cursor-pointer"
                    />
                  </Link>
                </div>
                <div className="hidden sm:block sm:ml-6">
                  <div className="flex items-center space-x-2 md:space-x-4">
                    {navigation.map((item) => (
                      <Link
                        key={item.name}
                        to={item.href}
                        className={classNames(
                          'header-nav-item nav-item rounded-md px-2 py-2 text-sm font-medium md:px-3',
                          item.current ? 'active' : ''
                        )}
                        aria-current={item.current ? 'page' : undefined}
                      >
                        {item.name}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
              <div className="absolute inset-y-0 right-0 flex items-center pr-2 sm:static sm:inset-auto sm:ml-6 sm:pr-0">
                <div className="relative">
                  <button
                    onClick={toggleProfileMenu}
                    className="header-profile-button flex rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-color)] focus:ring-offset-0 bg-transparent"
                  >
                    <span className="sr-only">Open user menu</span>
                    <div className="h-8 w-8 rounded-full flex items-center justify-center text-black bg-[var(--brand-color)] border border-[var(--brand-color-medium)] hover:border-[var(--brand-color)] transition-all overflow-hidden">
                      {profilePictureUrl ? (
                        <img
                          src={profilePictureUrl}
                          alt="Profile"
                          className="h-full w-full object-cover"
                          onError={() => {
                            // Fallback to user icon if image fails to load
                            setProfilePictureUrl(null);
                          }}
                        />
                      ) : (
                        <UserCircleIcon className="h-6 w-6 text-black" />
                      )}
                    </div>
                  </button>
                  
                  {isProfileMenuOpen && (
                    <div className="profile-dropdown absolute right-0 z-[150] mt-2 w-48 origin-top-right rounded-md py-1 shadow-lg bg-[var(--header-bg)] border border-[var(--brand-color-medium)]">
                      <Link
                        to="/profile"
                        className="block px-4 py-2 text-sm text-[#E8E8E8] hover:bg-[var(--header-hover)]"
                        onClick={() => setIsProfileMenuOpen(false)}
                      >
                        {t.profile}
                      </Link>
                      <button
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          handleLogout();
                        }}
                        className="block w-full text-left px-4 py-2 text-sm text-[#E8E8E8] logout-btn"
                        style={{ backgroundColor: 'transparent' }}
                      >
                        {t.logout}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Add an overlay to capture clicks outside the menu */}
          {open && (
            <div 
              className="fixed inset-0 bg-black/20 z-[80]" 
              onClick={() => close()}
              aria-hidden="true"
            />
          )}

          <Disclosure.Panel className="sm:hidden fixed left-0 z-[90] w-1/2 max-w-[200px]" style={{ top: '56px' }}>
            <div className="px-2 pt-2 pb-3 space-y-1 bg-[var(--header-bg)] shadow-lg border-t border-r border-[var(--brand-color-medium)] h-screen">
              {navigation.map((item) => (
                <Disclosure.Button
                  key={item.name}
                  as={Link}
                  to={item.href}
                  className={classNames(
                    'header-nav-item nav-item block w-full text-left rounded-md px-3 py-2 text-sm font-medium',
                    item.current ? 'active' : ''
                  )}
                  aria-current={item.current ? 'page' : undefined}
                >
                  {item.name}
                </Disclosure.Button>
              ))}
            </div>
          </Disclosure.Panel>
        </>
      )}
    </Disclosure>
  );
}; 