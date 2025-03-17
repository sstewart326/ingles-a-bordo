import { Fragment } from 'react';
import { Disclosure, Menu, Transition } from '@headlessui/react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuthWithMasquerade } from '../hooks/useAuthWithMasquerade';
import { useAdmin } from '../hooks/useAdmin';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
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
      { name: t.classPlans, href: '/admin/class-plans', current: location.pathname === '/admin/class-plans' }
    ] : [
      { name: t.schedule, href: '/schedule', current: location.pathname === '/schedule' }
    ])
  ];

  const dashboardPath = showAdminNav ? '/dashboard' : '/schedule';

  return (
    <Disclosure as="nav" className="header-nav">
      {({ open }) => (
        <>
          <div className="container mx-auto px-4">
            <div className="relative flex items-center justify-between h-14">
              <div className="absolute inset-y-0 left-0 flex items-center sm:hidden">
                <Disclosure.Button className="header-nav-button inline-flex items-center justify-center rounded-md p-2 text-[var(--brand-color)] hover:text-[var(--brand-color-dark)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--brand-color)] bg-transparent">
                  <span className="sr-only">Open main menu</span>
                  {open ? (
                    <XMarkIcon className="block h-6 w-6" aria-hidden="true" />
                  ) : (
                    <Bars3Icon className="block h-6 w-6" aria-hidden="true" />
                  )}
                </Disclosure.Button>
              </div>
              <div className="flex-1 flex items-center justify-center sm:items-stretch sm:justify-start">
                <div className="flex-shrink-0 flex items-center ml-8 sm:ml-0">
                  <Link to={dashboardPath}>
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
                <Menu as="div" className="relative">
                  <div>
                    <Menu.Button className="header-profile-button flex rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-color)] focus:ring-offset-0">
                      <span className="sr-only">Open user menu</span>
                      <div className="h-8 w-8 rounded-full flex items-center justify-center text-black bg-[var(--brand-color)] border border-[var(--brand-color-medium)] hover:border-[var(--brand-color)] transition-all">
                        {currentUser?.email?.charAt(0).toUpperCase()}
                      </div>
                    </Menu.Button>
                  </div>
                  <Transition
                    as={Fragment}
                    enter="transition ease-out duration-100"
                    enterFrom="transform opacity-0 scale-95"
                    enterTo="transform opacity-100 scale-100"
                    leave="transition ease-in duration-75"
                    leaveFrom="transform opacity-100 scale-100"
                    leaveTo="transform opacity-0 scale-95"
                  >
                    <Menu.Items className="header-dropdown absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md py-1 focus:outline-none">
                      <Menu.Item>
                        {({ active }) => (
                          <Link
                            to="/profile"
                            style={{ backgroundColor: active ? 'var(--header-hover)' : 'transparent', color: '#E8E8E8' }}
                            className={`header-dropdown-item block px-4 py-2 text-sm ${active ? 'header-dropdown-item-active' : ''}`}
                          >
                            {t.profile}
                          </Link>
                        )}
                      </Menu.Item>
                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={handleLogout}
                            style={{ backgroundColor: active ? 'var(--header-hover)' : 'transparent', color: '#E8E8E8' }}
                            className={`header-dropdown-item block w-full px-4 py-2 text-left text-sm ${active ? 'header-dropdown-item-active' : ''}`}
                          >
                            {t.logout}
                          </button>
                        )}
                      </Menu.Item>
                    </Menu.Items>
                  </Transition>
                </Menu>
              </div>
            </div>
          </div>

          <Disclosure.Panel className="sm:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1">
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