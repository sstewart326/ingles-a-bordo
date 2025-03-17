import { useMasquerade } from '../hooks/useMasquerade';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export const MasqueradeIndicator = () => {
  const { isMasquerading, masqueradingAs, stopMasquerade } = useMasquerade();
  const navigate = useNavigate();

  if (!isMasquerading || !masqueradingAs) {
    return null;
  }

  const handleStopMasquerade = () => {
    stopMasquerade();
    toast.success('Returned to admin view');
    navigate('/admin/users');
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-indigo-600 text-white py-2 px-4 flex flex-col sm:flex-row justify-between items-center z-50">
      <div className="flex items-center mb-2 sm:mb-0">
        <svg className="h-5 w-5 mr-2 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
        </svg>
        <span className="text-center sm:text-left">
          Impersonating <strong className="break-all">{masqueradingAs.name || masqueradingAs.email}</strong>
        </span>
      </div>
      <div className="flex space-x-2">
        <button
          onClick={handleStopMasquerade}
          className="bg-white text-indigo-600 px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-white w-full sm:w-auto"
        >
          Stop Impersonating
        </button>
      </div>
    </div>
  );
}; 