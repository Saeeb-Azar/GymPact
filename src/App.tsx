import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './components/RequireAuth';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { TodayPage } from './pages/TodayPage';
import { GroupPage } from './pages/GroupPage';
import { NewChallengePage } from './pages/NewChallengePage';
import { ProgressPage } from './pages/ProgressPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { JoinPage } from './pages/JoinPage';
import { AdminPage } from './pages/AdminPage';

export default function App() {
  return (
    <Routes>
      {/* Öffentliche Auth-Routen */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Geschützte Routen */}
      <Route element={<RequireAuth />}>
        {/* Einladung annehmen (ohne App-Shell) */}
        <Route path="/join/:code" element={<JoinPage />} />

        <Route element={<AppLayout />}>
          <Route path="/" element={<TodayPage />} />
          <Route path="/group" element={<GroupPage />} />
          <Route path="/group/new-challenge" element={<NewChallengePage />} />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
