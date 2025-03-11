import { Fragment } from 'react';
import { Disclosure, Menu, Transition } from '@headlessui/react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useAdmin } from '../hooks/useAdmin';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, logout } = useAuth();
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

  const navigation = [
    ...(isAdmin ? [
      { name: t.dashboard, href: '/dashboard', current: location.pathname === '/dashboard' },
      { name: t.manageUsers, href: '/admin/users', current: location.pathname === '/admin/users' },
      { name: t.manageSchedules, href: '/admin/schedule', current: location.pathname === '/admin/schedule' }
    ] : [
      { name: t.schedule, href: '/schedule', current: location.pathname === '/schedule' }
    ])
  ];

  const dashboardPath = isAdmin ? '/dashboard' : '/schedule';

  return (
    <Disclosure as="nav" className="header-nav bg-header">
      {({ open }) => (
        <>
          <div className="mx-auto max-w-7xl px-2 sm:px-6 lg:px-8">
            <div className="relative flex h-20 items-center justify-between">
              <div className="absolute inset-y-0 left-0 flex items-center sm:hidden">
                <Disclosure.Button className="header-nav-button relative inline-flex items-center justify-center rounded-md p-2 text-[var(--brand-color)] hover:text-[var(--brand-color-dark)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--brand-color)] bg-transparent">
                  <span className="sr-only">Open main menu</span>
                  {open ? (
                    <XMarkIcon className="block h-6 w-6" aria-hidden="true" />
                  ) : (
                    <Bars3Icon className="block h-6 w-6" aria-hidden="true" />
                  )}
                </Disclosure.Button>
              </div>
              <div className="flex flex-1 items-center justify-center sm:items-stretch sm:justify-start">
                <div className="flex flex-shrink-0 items-center mr-6 sm:mr-10 pl-10 sm:pl-0">
                  <Link to={dashboardPath}>
                    <img
                      src="/ingles-a-bordo.png"
                      alt="Inglês a Bordo"
                      className="h-12 w-auto cursor-pointer"
                    />
                  </Link>
                </div>
                <div className="hidden sm:ml-6 sm:block">
                  <div className="flex space-x-4">
                    {navigation.map((item) => (
                      <Link
                        key={item.name}
                        to={item.href}
                        className={classNames(
                          'header-nav-item nav-item rounded-md px-3 py-2 text-sm font-medium',
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
                <Menu as="div" className="relative ml-3">
                  <div>
                    <Menu.Button className="header-profile-button relative flex rounded-full text-sm">
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
                        {() => (
                          <Link
                            to="/profile"
                            className="header-dropdown-item block px-4 py-2 text-sm"
                          >
                            {t.profile}
                          </Link>
                        )}
                      </Menu.Item>
                      <Menu.Item>
                        {() => (
                          <button
                            onClick={handleLogout}
                            className="header-dropdown-item block w-full px-4 py-2 text-left text-sm"
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

          <Disclosure.Panel className="sm:hidden fixed inset-y-0 left-0 w-48 bg-[var(--header-bg)] shadow-lg transform transition-transform duration-200 ease-in-out z-50">
            <div className="pt-16 px-2 space-y-1">
              {navigation.map((item) => (
                <Disclosure.Button
                  key={item.name}
                  as={Link}
                  to={item.href}
                  className={classNames(
                    'header-nav-item nav-item block w-full text-left rounded-md px-3 py-2 text-base font-medium',
                    item.current ? 'bg-[var(--brand-color-light)] text-white' : 'text-gray-300 hover:bg-[var(--brand-color-light)] hover:text-white'
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