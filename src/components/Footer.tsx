import { EnvelopeIcon } from '@heroicons/react/24/outline';

const Footer = () => {
  return (
    <footer className="bg-[var(--header-bg)] text-white py-2">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center gap-1">
          <p className="text-center text-sm">
            © {new Date().getFullYear()} Inglês a Bordo, LLC. All rights reserved.
          </p>
          <a 
            href="mailto:cursoinglesabordo@gmail.com" 
            className="flex items-center gap-1 text-sm hover:text-gray-300 transition-colors"
          >
            <EnvelopeIcon className="h-5 w-5" />
            cursoinglesabordo@gmail.com
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer; 