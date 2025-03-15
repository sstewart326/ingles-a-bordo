import { BrowserRouter as Router } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { AdminProvider } from './contexts/AdminContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { MasqueradeProvider } from './contexts/MasqueradeContext';
import { AppRoutes } from './AppRoutes';
import { Toaster } from 'react-hot-toast';
import './styles/globals.css';
import './App.css';

function App() {
  return (
    <Router>
      <AuthProvider>
        <AdminProvider>
          <MasqueradeProvider>
            <LanguageProvider>
              <div className="background-clouds">
                <img src={new URL('./clouds.png', import.meta.url).href} alt="" />
              </div>
              <AppRoutes />
              <Toaster position="top-right" />
            </LanguageProvider>
          </MasqueradeProvider>
        </AdminProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
