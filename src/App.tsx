import { BrowserRouter as Router } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { AdminProvider } from './contexts/AdminContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { AppRoutes } from './AppRoutes';
import { Toaster } from 'react-hot-toast';
import './App.css';

function App() {
  return (
    <Router>
      <AuthProvider>
        <AdminProvider>
          <LanguageProvider>
            <AppRoutes />
            <Toaster position="top-right" />
          </LanguageProvider>
        </AdminProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
