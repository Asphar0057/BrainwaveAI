import { consumeReturnPath } from '../utils/returnPath';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Eye, EyeOff } from 'lucide-react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase/config';
import LoadingSpinner from '../components/LoadingSpinner';
import GeometricGrid from '../components/GeometricGrid';
import './Login.css';
import { API_URL } from '../config/api';
import {
  canRestoreGoogleSession,
  enableGoogleAutoSignIn,
  hasUsableBackendSession,
  restoreGoogleBackendSession,
  signOutAppSession,
  storeGoogleBackendSession,
} from '../utils/authSession';
import { clearBackendSession } from '../utils/backendSession';
import { fetchAccountSession } from '../utils/institutionSession';
import { setLearnDestination } from '../utils/workspace';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetStep, setResetStep] = useState('request');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetStatus, setResetStatus] = useState('');
  const [showResetNewPassword, setShowResetNewPassword] = useState(false);
  const [showResetConfirmPassword, setShowResetConfirmPassword] = useState(false);
  const [resetForm, setResetForm] = useState({
    identifier: '',
    otp: '',
    newPassword: '',
    confirmPassword: ''
  });
  const navigate = useNavigate();

  const exchangeGoogleSession = async (user) => {
    const idToken = await user.getIdToken();
    const backendResponse = await axios.post(`${API_URL}/firebase-auth`, {
      idToken,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      uid: user.uid
    });

    const { access_token, user: userData } = backendResponse.data;
    storeGoogleBackendSession(access_token, userData);
    return userData;
  };

  const checkAndRedirect = async (username) => {
    const requestToken = localStorage.getItem('token');
    const requestUsername = localStorage.getItem('username');
    const accountIsStillActive = () => (
      localStorage.getItem('token') === requestToken
      && localStorage.getItem('username') === requestUsername
    );

    try {
      const accountSession = await fetchAccountSession({ force: true });
      if (!accountIsStillActive()) return;
      const returnTo = consumeReturnPath();
      if (returnTo) { window.location.replace(returnTo); return; }

      if (accountSession.role === 'student' || accountSession.role === 'educator') {
        window.location.replace(accountSession.landing_route);
        return;
      }
      
      try {
        const profileResponse = await axios.get(`${API_URL}/get_comprehensive_profile?user_id=${username}`, {
          headers: { 'Authorization': `Bearer ${requestToken}` }
        });
        
        if (profileResponse.data && accountIsStillActive()) {
          const profileData = profileResponse.data;
          const existingProfile = localStorage.getItem('userProfile');
          let mergedProfile = {};
          if (existingProfile) {
            try {
              mergedProfile = JSON.parse(existingProfile);
            } catch (e) { /* silenced */ }
          }
          
          mergedProfile = {
            ...mergedProfile,
            firstName: profileData.firstName || mergedProfile.firstName || '',
            lastName: profileData.lastName || mergedProfile.lastName || '',
            email: profileData.email || mergedProfile.email || '',
            fieldOfStudy: profileData.fieldOfStudy || '',
            brainwaveGoal: profileData.brainwaveGoal || '',
            preferredSubjects: profileData.preferredSubjects || [],
            difficultyLevel: profileData.difficultyLevel || 'intermediate',
            learningPace: profileData.learningPace || 'moderate',
            primaryArchetype: profileData.primaryArchetype || '',
            secondaryArchetype: profileData.secondaryArchetype || '',
            archetypeDescription: profileData.archetypeDescription || '',
            showStudyInsights: profileData.showStudyInsights !== false
          };
          
          localStorage.setItem('userProfile', JSON.stringify(mergedProfile));
        }
      } catch (_) { /* silenced */ }
      
      const response = await axios.get(`${API_URL}/check_profile_quiz?user_id=${username}`, {
        headers: { 'Authorization': `Bearer ${requestToken}` }
      });
      if (!accountIsStillActive()) return;

      if (response.data.completed) {
        sessionStorage.setItem('justLoggedIn', 'true');
        setLearnDestination('/dashboard-cerbyl');
        window.location.replace('/dashboard-cerbyl');
      } else {
        setLearnDestination('/profile-quiz');
        window.location.replace('/profile-quiz');
      }
    } catch (error) {
      if (!accountIsStillActive()) return;
      setLearnDestination('/profile-quiz');
      window.location.replace('/workspace');
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      await signOutAppSession();
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const userData = await exchangeGoogleSession(user);
      enableGoogleAutoSignIn();
      
      sessionStorage.setItem('justLoggedIn', 'true');

      await checkAndRedirect(userData.email);
    } catch (error) {
            
      if (error.code === 'auth/popup-blocked') {
        alert('Popup was blocked. Please allow popups for this site and try again.');
      } else if (error.code !== 'auth/popup-closed-by-user') {
        alert('Google sign-in failed: ' + (error.message || 'Unknown error'));
      }
    }
    setGoogleLoading(false);
  };

  useEffect(() => {
    let cancelled = false;

    const restoreGoogleSignIn = async () => {
      if (hasUsableBackendSession()) {
        await checkAndRedirect(localStorage.getItem('username'));
        return;
      }

      if (!canRestoreGoogleSession()) {
        if (localStorage.getItem('token') || localStorage.getItem('username')) {
          clearBackendSession();
        }
        return;
      }

      try {
        setGoogleLoading(true);
        const userData = await restoreGoogleBackendSession();
        if (!userData?.email) {
          clearBackendSession();
          return;
        }
        if (!cancelled) await checkAndRedirect(userData.email);
      } catch (_) {
        clearBackendSession();
        // Leave the normal sign-in controls available if silent restoration fails.
      } finally {
        if (!cancelled) setGoogleLoading(false);
      }
    };

    restoreGoogleSignIn();
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!username.trim() || !password.trim()) {
      alert("Please enter both username and password");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/token`,
        new URLSearchParams({
          username,
          password
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          }
        }
      );

      const token = response.data.access_token;
      await signOutAppSession();
      localStorage.setItem('token', token);
      localStorage.setItem('username', username.trim());
      
      sessionStorage.setItem('justLoggedIn', 'true');
      
      await checkAndRedirect(username.trim());
    } catch (err) {
            alert('Login failed: ' + (err.response?.data?.detail || 'Unknown error'));
    }
    setLoading(false);
  };

  const handleResetChange = (field, value) => {
    setResetForm(prev => ({ ...prev, [field]: value }));
  };

  const requestResetOtp = async (e) => {
    e.preventDefault();
    if (!resetForm.identifier.trim()) {
      setResetStatus('Enter your account email or phone number.');
      return;
    }

    setResetLoading(true);
    setResetStatus('');
    try {
      const response = await axios.post(`${API_URL}/password-reset/request`, {
        identifier: resetForm.identifier.trim()
      });
      const devOtp = response.data?.dev_otp ? ` Dev OTP: ${response.data.dev_otp}` : '';
      setResetStatus(`${response.data?.message || 'OTP sent if the account exists.'}${devOtp}`);
      setResetStep('confirm');
    } catch (err) {
      setResetStatus(err.response?.data?.detail || 'Could not send OTP. Try again.');
    } finally {
      setResetLoading(false);
    }
  };

  const confirmResetPassword = async (e) => {
    e.preventDefault();
    if (resetForm.newPassword !== resetForm.confirmPassword) {
      setResetStatus('Passwords do not match.');
      return;
    }

    setResetLoading(true);
    setResetStatus('');
    try {
      const response = await axios.post(`${API_URL}/password-reset/confirm`, {
        identifier: resetForm.identifier.trim(),
        otp: resetForm.otp.trim(),
        new_password: resetForm.newPassword
      });
      setResetStatus(response.data?.message || 'Password updated successfully.');
      setPassword('');
      setResetStep('request');
      setResetForm({ identifier: '', otp: '', newPassword: '', confirmPassword: '' });
      setShowResetNewPassword(false);
      setShowResetConfirmPassword(false);
      setTimeout(() => setResetOpen(false), 1200);
    } catch (err) {
      setResetStatus(err.response?.data?.detail || 'Could not reset password. Try again.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <>
      {(loading || googleLoading) && <LoadingSpinner />}
      <div className="lg-page">
        <div className="lg-bg-fx" aria-hidden>
          <div className="lg-bg-wash" />
          <div className="lg-bg-orb lg-bg-orb-1" />
          <div className="lg-bg-orb lg-bg-orb-2" />
          <GeometricGrid className="lg-bg-geo" linesClassName="lg-bg-geo-lines" numsClassName="lg-bg-geo-nums" />
          <div className="lg-bg-grain" />
          <div className="lg-bg-vignette" />
        </div>

        <Link className="lg-back-link" to="/">Back</Link>

        <div className="lg-card">
          <div className="lg-card-texture" aria-hidden>
            <GeometricGrid className="lg-bg-geo" linesClassName="lg-bg-geo-lines" numsClassName="lg-bg-geo-nums" />
            <div className="lg-bg-grain" />
          </div>

          <div className="lg-card-inner">
            <div className="lg-hero">
              <div className="lg-hero-word">cerbyl</div>
            </div>

            <button
              className="lg-google-btn"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || loading}
            >
              {googleLoading ? (
                <>
                  <div className="lg-spinner" />
                  <span>Signing in…</span>
                </>
              ) : (
                <>
                  <svg className="lg-google-icon" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  <span>Continue with Google</span>
                </>
              )}
            </button>

            <div className="lg-divider"><span>or</span></div>

            <form onSubmit={handleSubmit} className="lg-form">
              <div className="lg-field">
                <label className="lg-label" htmlFor="lg-username">Username</label>
                <input
                  id="lg-username"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="lg-input"
                  placeholder="Enter your username"
                  required
                  disabled={loading || googleLoading}
                />
              </div>
              <div className="lg-field">
                <label className="lg-label" htmlFor="lg-password">Password</label>
                <div className="lg-input-group">
                  <input
                    id="lg-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="lg-input lg-input--pw"
                    placeholder="Enter your password"
                    required
                    disabled={loading || googleLoading}
                  />
                  <button
                    type="button"
                    className="lg-eye-btn"
                    onClick={() => setShowPassword(v => !v)}
                    disabled={loading || googleLoading}
                    tabIndex={0}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <button type="submit" className="lg-submit" disabled={loading || googleLoading}>
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            <button
              type="button"
              className="lg-forgot-btn"
              onClick={() => {
                setResetOpen(prev => !prev);
                setResetStatus('');
              }}
              disabled={loading || googleLoading}
            >
              Forgot password?
            </button>

            {resetOpen && (
              <div className="lg-reset-panel">
                {resetStep === 'request' ? (
                  <form onSubmit={requestResetOtp} className="lg-form">
                    <div className="lg-field">
                      <label className="lg-label" htmlFor="lg-reset-identifier">Account email or phone number</label>
                      <input
                        id="lg-reset-identifier"
                        type="text"
                        value={resetForm.identifier}
                        onChange={e => handleResetChange('identifier', e.target.value)}
                        className="lg-input"
                        placeholder="you@example.com or +14155552671"
                        required
                        disabled={resetLoading}
                      />
                    </div>
                    <button type="submit" className="lg-submit lg-submit-secondary" disabled={resetLoading}>
                      {resetLoading ? 'Sending OTP…' : 'Send OTP'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={confirmResetPassword} className="lg-form">
                    <div className="lg-field">
                      <label className="lg-label" htmlFor="lg-reset-otp">6-digit OTP</label>
                      <input
                        id="lg-reset-otp"
                        type="text"
                        value={resetForm.otp}
                        onChange={e => handleResetChange('otp', e.target.value)}
                        className="lg-input"
                        placeholder="000000"
                        inputMode="numeric"
                        maxLength={6}
                        required
                        disabled={resetLoading}
                      />
                    </div>
                    <div className="lg-field">
                      <label className="lg-label" htmlFor="lg-reset-newpw">New password</label>
                      <div className="lg-input-group">
                        <input
                          id="lg-reset-newpw"
                          type={showResetNewPassword ? 'text' : 'password'}
                          value={resetForm.newPassword}
                          onChange={e => handleResetChange('newPassword', e.target.value)}
                          className="lg-input lg-input--pw"
                          placeholder="Enter a new password"
                          required
                          disabled={resetLoading}
                        />
                        <button
                          type="button"
                          className="lg-eye-btn"
                          onClick={() => setShowResetNewPassword(v => !v)}
                          disabled={resetLoading}
                          tabIndex={0}
                          aria-label={showResetNewPassword ? 'Hide password' : 'Show password'}
                        >
                          {showResetNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                    <div className="lg-field">
                      <label className="lg-label" htmlFor="lg-reset-confirmpw">Confirm password</label>
                      <div className="lg-input-group">
                        <input
                          id="lg-reset-confirmpw"
                          type={showResetConfirmPassword ? 'text' : 'password'}
                          value={resetForm.confirmPassword}
                          onChange={e => handleResetChange('confirmPassword', e.target.value)}
                          className="lg-input lg-input--pw"
                          placeholder="Re-enter the new password"
                          required
                          disabled={resetLoading}
                        />
                        <button
                          type="button"
                          className="lg-eye-btn"
                          onClick={() => setShowResetConfirmPassword(v => !v)}
                          disabled={resetLoading}
                          tabIndex={0}
                          aria-label={showResetConfirmPassword ? 'Hide password' : 'Show password'}
                        >
                          {showResetConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                    <button type="submit" className="lg-submit lg-submit-secondary" disabled={resetLoading}>
                      {resetLoading ? 'Updating…' : 'Reset Password'}
                    </button>
                  </form>
                )}

                {resetStatus && <div className="lg-reset-status">{resetStatus}</div>}
              </div>
            )}

            <div className="lg-footer">
              Don't have an account?
              <Link className="lg-link" to="/register">Create one</Link>
            </div>
            <nav className="lg-legal-links" aria-label="Legal">
              <Link to="/terms-and-conditions">Terms</Link>
              <Link to="/privacy-policy">Privacy</Link>
              <Link to="/contact">Contact</Link>
            </nav>
          </div>
        </div>
      </div>
    </>
  );
}

export default Login;
