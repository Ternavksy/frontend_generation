import { Route, Routes, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  DashboardPage,
  AuthPage,
  WorkspacePage,
  DatasetsPage,
  ModelsPage,
  ProfilePage,
  UploadPage,
  AdminPage,
  BillingPage
} from './pages';
import { TopNav } from './components';
import SplashScreen from './components/SplashScreen';

const App = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isAuthorized, setIsAuthorized] = useState(true); // Changed to true for demo
  const [isSplashVisible, setIsSplashVisible] = useState(false);

  const handleLogin = () => {
    setIsAuthorized(true);
    setIsSplashVisible(true);
    navigate('/dashboard');
  };

  if (isSplashVisible) {
    return <SplashScreen onLoadComplete={() => setIsSplashVisible(false)} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {isAuthorized && <TopNav />}
      <main className="px-4 py-5 xl:px-12">
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<Navigate to={isAuthorized ? '/dashboard' : '/auth'} replace />} />
            <Route path="/auth" element={isAuthorized ? <Navigate to="/dashboard" replace /> : <AuthPage onLogin={handleLogin} />} />
            <Route path="/dashboard" element={isAuthorized ? <DashboardPage /> : <Navigate to="/auth" replace />} />
            <Route path="/projects" element={isAuthorized ? <DatasetsPage /> : <Navigate to="/auth" replace />} />
            <Route path="/models" element={isAuthorized ? <ModelsPage /> : <Navigate to="/auth" replace />} />
            <Route path="/upload" element={isAuthorized ? <UploadPage /> : <Navigate to="/auth" replace />} />
            <Route path="/workspace" element={isAuthorized ? <WorkspacePage /> : <Navigate to="/auth" replace />} />
            <Route path="/profile" element={isAuthorized ? <ProfilePage /> : <Navigate to="/auth" replace />} />
            <Route path="/billing" element={isAuthorized ? <BillingPage /> : <Navigate to="/auth" replace />} />
            <Route path="/admin" element={isAuthorized ? <AdminPage /> : <Navigate to="/auth" replace />} />
            <Route path="*" element={<div className="mt-20 text-center text-lg">Страница не найдена</div>} />
          </Routes>
        </AnimatePresence>
      </main>
    </div>
  );
};

export default App;
