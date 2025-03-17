import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMasquerade } from '../hooks/useMasquerade';
import toast from 'react-hot-toast';

interface MasqueradeButtonProps {
  userId: string;
  userName: string;
  userEmail: string;
}

export const MasqueradeButton = ({ userId, userName, userEmail }: MasqueradeButtonProps) => {
  const { startMasquerade } = useMasquerade();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleMasquerade = async () => {
    try {
      setLoading(true);
      await startMasquerade(userId);
      toast.success(`Now viewing as ${userName || userEmail}`);
      // Navigate to the student's schedule page
      navigate('/schedule');
    } catch (error) {
      console.error('Error starting masquerade:', error);
      toast.error('Failed to masquerade as user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleMasquerade}
      disabled={loading}
      className="btn-copy-soft w-[130px] flex items-center justify-center whitespace-nowrap overflow-hidden block"
      title={`Impersonate ${userName || userEmail}`}
    >
      {loading ? (
        <svg className="animate-spin mr-1 h-4 w-4 flex-shrink-0 text-indigo-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : (
        <svg className="h-4 w-4 mr-1 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
        </svg>
      )}
      <span className="truncate text-xs">Impersonate</span>
    </button>
  );
}; 