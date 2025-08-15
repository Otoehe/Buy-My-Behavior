// 📄 App.tsx — оновлено логіку: повідомлення після реєстрації, один редірект на профіль, збереження через localStorage

import { Toaster } from 'react-hot-toast';
import UploadBehavior from './UploadBehavior';
import React, { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from './lib/supabase';
import BehaviorsFeed from './components/BehaviorsFeed';
import NavigationBar from './components/NavigationBar';
import Register from './components/Register';
import Profile from './components/Profile';
import MapView from './components/MapView';
import ScenarioForm from './components/ScenarioForm';
import ReceivedScenarios from './components/ReceivedScenarios';
import ReceivedScenarioCardWrapper from './components/ReceivedScenarioCard';
import SelectLocation from './components/SelectLocation';
import KYCForm from './components/KYCForm';
import AdminDashboard from './components/AdminDashboard';
import Manifest from './components/Manifest';
import MyOrders from './components/MyOrders';
import ScenarioLocation from './components/ScenarioLocation';

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const [hasRedirected, setHasRedirected] = useState(() => {
    return localStorage.getItem('hasRedirected') === 'true';
  });

  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);

      const publicRoutes = ['/register'];
      const isPublic = publicRoutes.includes(location.pathname);
      if (!data.session && !isPublic) {
        navigate('/register');
      }
    };

    getSession();

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);

      if (event === 'SIGNED_IN' && !hasRedirected) {
        setHasRedirected(true);
        localStorage.setItem('hasRedirected', 'true');

        const lastVisited = localStorage.getItem('lastVisitedPath') || '/map';
        navigate(lastVisited);
      }
    });

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, [location.pathname, navigate, hasRedirected]);

  useEffect(() => {
    const justRegistered = localStorage.getItem('justRegistered');
    if (justRegistered === 'true') {
      alert('✅ Ви успішно зареєструвались! Перейдіть на свою пошту та натисніть на магічне посилання для входу.');
      localStorage.removeItem('justRegistered');
    }

    const params = new URLSearchParams(window.location.hash);
    const error = params.get('error');
    const errorCode = params.get('error_code');

    if (error && errorCode === 'otp_expired') {
      alert('⚠️ Магічне посилання недійсне або протерміноване. Повторіть вхід.');
      navigate('/register');
    }
  }, [navigate]);

  return (
    <>
      <NavigationBar />
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/map" element={<MapView />} />
        <Route path="/scenario" element={<ScenarioForm />} />
        <Route path="/select-location" element={<SelectLocation />} />
        <Route path="/scenario/:id" element={<ReceivedScenarioCardWrapper />} />
        <Route path="/received" element={<ReceivedScenarios />} />
        <Route path="/my-orders" element={<MyOrders />} />
        <Route path="/scenario-location" element={<ScenarioLocation />} />
        <Route path="/kyc" element={<KYCForm />} />
        <Route path="/manifest" element={<Manifest />} />
        <Route path="/behaviors" element={<BehaviorsFeed gridMode={true} />} />
        <Route path="/behaviors/:id" element={<BehaviorsFeed gridMode={true} />} />
        <Route path="/admin-dashboard" element={<AdminDashboard />} />
      </Routes>
    </>
  );
};

export default App;
