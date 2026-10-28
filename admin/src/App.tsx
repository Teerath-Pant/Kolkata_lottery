import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Activity } from './pages/Activity';
import { Dashboard } from './pages/Dashboard';
import { Draws } from './pages/Draws';
import { Login } from './pages/Login';
import { Packages } from './pages/Packages';
import { Users } from './pages/Users';
import { Winners } from './pages/Winners';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/draws" element={<Draws />} />
        <Route path="/packages" element={<Packages />} />
        <Route path="/users" element={<Users />} />
        <Route path="/winners" element={<Winners />} />
        <Route path="/activity" element={<Activity />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
