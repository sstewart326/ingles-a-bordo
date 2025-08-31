import { useState, useEffect } from 'react';
import { useAdmin } from '../hooks/useAdmin';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { getFunctionBaseUrl, getIdToken } from '../utils/firebaseUtils';
import toast from 'react-hot-toast';
import { styles } from '../styles/styleUtils';
import { 
  EnvelopeIcon, 
  CheckIcon, 
} from '@heroicons/react/24/outline';

interface PaymentDueUser {
  name: string;
  email: string;
}

interface TotalDue {
  amount: number;
  currency: string;
}

interface PaymentDueItem {
  dueDate: string;
  users: PaymentDueUser[];
  id: string;
  totalDue: TotalDue;
}

export const AdminPayments = () => {
  const { isAdmin } = useAdmin();
  const { language } = useLanguage();
  const t = useTranslation(language);
  
  const [paymentsDue, setPaymentsDue] = useState<PaymentDueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingEmails, setSendingEmails] = useState(false);
  const [selectedPayments, setSelectedPayments] = useState<Set<string>>(new Set());

  // Fetch payments due data
  const fetchPaymentsDue = async () => {
    try {
      setLoading(true);
      const idToken = await getIdToken();
      const baseUrl = getFunctionBaseUrl();
      
      const response = await fetch(`${baseUrl}/paymentsDue`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      // Sort payments by due date from soonest to latest
      const sortedData = data.sort((a: PaymentDueItem, b: PaymentDueItem) => {
        const dateA = new Date(a.dueDate);
        const dateB = new Date(b.dueDate);
        return dateA.getTime() - dateB.getTime();
      });
      setPaymentsDue(sortedData);
    } catch (error) {
      console.error('Error fetching payments due:', error);
      toast.error(t.error || 'Failed to fetch payments due');
    } finally {
      setLoading(false);
    }
  };

  // Send emails for selected payments
  const sendEmailsForSelectedPayments = async () => {
    if (selectedPayments.size === 0) {
      toast.error(t.selectPaymentsToSendEmails || 'Please select payments to send emails');
      return;
    }

    try {
      setSendingEmails(true);
      const idToken = await getIdToken();
      const baseUrl = getFunctionBaseUrl();
      
      const response = await fetch(`${baseUrl}/sendPaymentEmails`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          paymentIds: Array.from(selectedPayments)
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      toast.success(result.message || 'Emails sent successfully');
      
      // Clear selection and refresh data
      setSelectedPayments(new Set());
      await fetchPaymentsDue();
    } catch (error) {
      console.error('Error sending emails:', error);
      toast.error(t.error || 'Failed to send emails');
    } finally {
      setSendingEmails(false);
    }
  };

  // Toggle payment selection
  const togglePaymentSelection = (paymentId: string) => {
    const newSelected = new Set(selectedPayments);
    if (newSelected.has(paymentId)) {
      newSelected.delete(paymentId);
    } else {
      newSelected.add(paymentId);
    }
    setSelectedPayments(newSelected);
  };



  // Toggle select all payments
  const toggleSelectAllPayments = () => {
    if (selectedPayments.size === paymentsDue.length) {
      // If all are selected, deselect all
      setSelectedPayments(new Set());
    } else {
      // Otherwise, select all
      const allPaymentIds = paymentsDue.map(payment => payment.id);
      setSelectedPayments(new Set(allPaymentIds));
    }
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Format currency for display
  const formatCurrency = (amount: number, currency: string) => {
    try {
      return new Intl.NumberFormat(language === 'pt-BR' ? 'pt-BR' : 'en-US', {
        style: 'currency',
        currency: currency
      }).format(amount);
    } catch (error) {
      console.error(`invalid currency code ${currency} amount ${amount}`);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchPaymentsDue();
    }
  }, [isAdmin]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="py-6 w-full max-w-4xl mx-auto px-4 sm:px-6">
      <div className="md:flex md:items-center md:justify-between mb-6">
        <div className="flex-1 min-w-0">
          <h1 className={styles.headings.h1}>
            {t.paymentsDue || 'Payments Due'}
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {t.paymentsDueDescription || 'View and manage payment emails for students'}
          </p>
        </div>
        <div className="mt-4 md:mt-0 md:ml-4 flex space-x-2">
          <button
            onClick={toggleSelectAllPayments}
            className={styles.buttons.secondary}
            disabled={paymentsDue.length === 0}
          >
            {selectedPayments.size === paymentsDue.length ? (t.deselectAll || 'Deselect All') : (t.selectAll || 'Select All')}
          </button>
          <button
            onClick={sendEmailsForSelectedPayments}
            className={styles.buttons.primary}
            disabled={selectedPayments.size === 0 || sendingEmails}
          >
            {sendingEmails ? (
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                {t.sendingEmails || 'Sending...'}
              </div>
            ) : (
              <div className="flex items-center">
                <EnvelopeIcon className="h-4 w-4 mr-2" />
                {t.sendEmails || 'Send Emails'}
              </div>
            )}
          </button>
        </div>
      </div>

      {paymentsDue.length === 0 ? (
        <div className="text-center py-12">
          <EnvelopeIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            {t.noPaymentsDue || 'No payments due'}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {t.noPaymentsDueDescription || 'There are currently no payments due for email reminders'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {paymentsDue.map((payment) => (
            <div
              key={payment.id}
              className={`
                bg-white rounded-lg border-2 transition-all duration-200 hover:shadow-md
                ${selectedPayments.has(payment.id) 
                  ? 'border-indigo-500 bg-indigo-50 shadow-sm' 
                  : 'border-gray-200 hover:border-gray-300'
                }
              `}
            >
              <div className="px-4 py-2.5">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2.5">
                      <input
                        type="checkbox"
                        checked={selectedPayments.has(payment.id)}
                        onChange={() => togglePaymentSelection(payment.id)}
                        className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 focus:ring-2 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-gray-900 truncate">
                          {formatDate(payment.dueDate)}
                        </h3>
                        <div className="flex items-center justify-between mt-0.5">
                          <p className="text-sm text-gray-500">
                            {t.dueDate || 'Due Date'}: {formatDate(payment.dueDate)}
                          </p>
                          <p className="text-sm font-semibold text-gray-900">
                            {formatCurrency(payment.totalDue.amount, payment.totalDue.currency)}
                          </p>
                        </div>
                        <div className="mt-1.5">
                          <p className="text-sm text-gray-700 leading-relaxed">
                            {payment.users.map((user, index) => (
                              <span key={index} className="inline-block">
                                <span className="font-medium text-gray-900">{user.name}</span>
                                <span className="text-gray-500"> ({user.email})</span>
                                {index < payment.users.length - 1 && (
                                  <span className="text-gray-300 mx-2">•</span>
                                )}
                              </span>
                            ))}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedPayments.size > 0 && (
        <div className="mt-6 bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center mr-3">
                <CheckIcon className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-indigo-900">
                  {selectedPayments.size} {selectedPayments.size === 1 ? t.paymentSelected : t.paymentsSelected}
                </p>
                <p className="text-xs text-indigo-600">
                  {t.readyToSendEmails || 'ready to send emails'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setSelectedPayments(new Set())}
              className="px-3 py-1.5 text-sm font-medium text-indigo-700 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
            >
              {t.clearSelection || 'Clear Selection'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}; 