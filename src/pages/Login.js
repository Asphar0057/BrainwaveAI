import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase/config';
import LoadingSpinner from '../components/LoadingSpinner';
import GeometricGrid from '../components/GeometricGrid';
import logo from '../assets/logo.svg';
import './Login.css';
import { API_URL } from '../config/api';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetStep, setResetStep] = useState('request');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetStatus, setResetStatus] = useState('');
  const [resetForm, setResetForm] = useState({
    email: '',
    otp: '',
    newPassword: '',
    confirmPassword: ''
  });
  const navigate = useNavigate();

  const checkAndRedirect = async (username) => {
    try {
      const token = localStorage.getItem('token');
      
      try {
        const profileResponse = await axios.get(`${API_URL}/get_comprehensive_profile?user_id=${username}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (profileResponse.data) {
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
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.data.completed) {
        sessionStorage.setItem('justLoggedIn', 'true');
        navigate('/dashboard-cerbyl');
      } else {
        navigate('/profile-quiz');
      }
    } catch (error) {
            navigate('/profile-quiz');
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      const idToken = await user.getIdToken();
      
      const backendResponse = await axios.post(`${API_URL}/firebase-auth`, {
        idToken: idToken,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        uid: user.uid
      });

      const { access_token, user: userData } = backendResponse.data;
      
      localStorage.setItem('token', access_token);
      localStorage.setItem('username', userData.email);
      localStorage.setItem('userProfile', JSON.stringify({
        firstName: userData.first_name,
        lastName: userData.last_name,
        email: userData.email,
        picture: userData.picture_url,
        googleUser: true
      }));
      
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
      localStorage.setItem('token', token);
      localStorage.setItem('username', username);
      
      sessionStorage.setItem('justLoggedIn', 'true');
      
      await checkAndRedirect(username);
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
    if (!resetForm.email.trim()) {
      setResetStatus('Enter your account email.');
      return;
    }

    setResetLoading(true);
    setResetStatus('');
    try {
      const response = await axios.post(`${API_URL}/password-reset/request`, {
        email: resetForm.email.trim()
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
        email: resetForm.email.trim(),
        otp: resetForm.otp.trim(),
        new_password: resetForm.newPassword
      });
      setResetStatus(response.data?.message || 'Password updated successfully.');
      setPassword('');
      setResetStep('request');
      setResetForm({ email: '', otp: '', newPassword: '', confirmPassword: '' });
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
        <div className="lg-orb lg-orb-1" />
        <div className="lg-orb lg-orb-2" />
        <GeometricGrid className="lg-bg-geo" linesClassName="lg-bg-geo-lines" numsClassName="lg-bg-geo-nums" />
        <div className="lg-grain" />
        <div className="lg-watermark">
          <img src={logo} alt="" className="lg-watermark-img" />
        </div>

        <span className="lg-back-link" onClick={() => navigate('/')}>Back</span>

        <div className="lg-card">
          <div className="lg-brand">
            <div className="lg-brand-name">cerbyl</div>
          </div>

          <div className="lg-title">Sign in to continue</div>

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
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="lg-input"
                placeholder="Username"
                required
                disabled={loading || googleLoading}
              />
            </div>
            <div className="lg-field">
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="lg-input"
                placeholder="Password"
                required
                disabled={loading || googleLoading}
              />
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
                    <input
                      type="email"
                      value={resetForm.email}
                      onChange={e => handleResetChange('email', e.target.value)}
                      className="lg-input"
                      placeholder="Account email"
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
                    <input
                      type="text"
                      value={resetForm.otp}
                      onChange={e => handleResetChange('otp', e.target.value)}
                      className="lg-input"
                      placeholder="6-digit OTP"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      disabled={resetLoading}
                    />
                  </div>
                  <div className="lg-field">
                    <input
                      type="password"
                      value={resetForm.newPassword}
                      onChange={e => handleResetChange('newPassword', e.target.value)}
                      className="lg-input"
                      placeholder="New password"
                      required
                      disabled={resetLoading}
                    />
                  </div>
                  <div className="lg-field">
                    <input
                      type="password"
                      value={resetForm.confirmPassword}
                      onChange={e => handleResetChange('confirmPassword', e.target.value)}
                      className="lg-input"
                      placeholder="Confirm new password"
                      required
                      disabled={resetLoading}
                    />
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
            <span className="lg-link" onClick={() => navigate('/register')}>Create one</span>
          </div>
        </div>
      </div>
    </>
  );
}

export default Login;
