import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Frame, Shell } from './components/Layout';
import { AuthPage } from './pages/Auth';
import { Book } from './pages/Book';
import { DrawPage } from './pages/Draw';
import { Help, Settings } from './pages/Info';
import { Home } from './pages/Home';
import { More } from './pages/More';
import { Packages } from './pages/Packages';
import { Results } from './pages/Results';
import { Splash } from './pages/Splash';
import { Tickets } from './pages/Tickets';
import { Verify } from './pages/Verify';
import { Wallet } from './pages/Wallet';

export default function App() {
  const [splash, setSplash] = useState(() => sessionStorage.getItem('ltd.splash') !== '1');
  useEffect(() => {
    if (!splash) return;
    const t = setTimeout(() => { sessionStorage.setItem('ltd.splash', '1'); setSplash(false); }, 1600);
    return () => clearTimeout(t);
  }, [splash]);
  if (splash) return <Splash />;

  return (
    <Routes>
      <Route path="/login" element={<Frame><AuthPage /></Frame>} />
      <Route element={<Shell />}>
        <Route path="/" element={<Home />} />
        <Route path="/tickets" element={<Tickets />} />
        <Route path="/results" element={<Results />} />
        <Route path="/wallet" element={<Wallet />} />
        <Route path="/more" element={<More />} />
      </Route>
      <Route element={<Shell tabs={false} />}>
        <Route path="/packages" element={<Packages />} />
        <Route path="/draw/:id" element={<DrawPage />} />
        <Route path="/book/:id" element={<Book />} />
        <Route path="/verify" element={<Verify />} />
        <Route path="/verify/:id" element={<Verify />} />
        <Route path="/help" element={<Help />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
