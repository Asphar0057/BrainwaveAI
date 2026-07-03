import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithPopup } from 'firebase/auth';
import axios from 'axios';
import { auth, googleProvider } from '../firebase/config';
import LoadingSpinner from '../components/LoadingSpinner';
import logo from '../assets/logo.svg';
import './Login.css';
import { API_URL } from '../config/api';

function Register() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [verificationStep, setVerificationStep] = useState('form');
  const [registrationOtp, setRegistrationOtp] = useState('');
  const [registrationStatus, setRegistrationStatus] = useState('');
  const navigate = useNavigate();

  const handleChange = (e) => {
    if (verificationStep === 'verify') {
      setVerificationStep('form');
      setRegistrationOtp('');
      setRegistrationStatus('');
    }
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const idToken = await user.getIdToken();

      const backendResponse = await axios.post(`${API_URL}/firebase-auth`, {
        idToken,
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
      navigate('/profile-quiz');
    } catch (error) {
      if (error.code === 'auth/popup-blocked') {
        alert('Popup was blocked. Please allow popups for this site and try again.');
      } else if (error.code !== 'auth/popup-closed-by-user') {
        alert('Google sign-in failed: ' + (error.message || 'Unknown error'));
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.firstName || !formData.lastName || !formData.email || !formData.username ||
        !formData.password || !formData.confirmPassword) {
      alert('Please fill in all fields');
      return;
    }

    if (!/^[A-Za-z0-9_.-]{3,50}$/.test(formData.username.trim())) {
      alert('Username must be 3-50 characters and can only use letters, numbers, dots, underscores, or hyphens.');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      alert('Passwords do not match');
      return;
    }

    setLoading(true);
    setRegistrationStatus('');
    try {
      const res = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: formData.firstName,
          last_name: formData.lastName,
          email: formData.email.trim(),
          username: formData.username.trim(),
          password: formData.password
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || `HTTP ${res.status}`);
      }

      const devOtp = data.dev_otp ? ` Dev OTP: ${data.dev_otp}` : '';
      setRegistrationStatus(`${data.message || 'Verification OTP sent.'}${devOtp}`);
      setVerificationStep('verify');
    } catch (err) {
      alert('Registration failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyRegistration = async (e) => {
    e.preventDefault();

    if (!registrationOtp.trim()) {
      setRegistrationStatus('Enter the OTP sent to your email.');
      return;
    }

    setLoading(true);
    setRegistrationStatus('');
    try {
      const res = await fetch(`${API_URL}/register/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email.trim(),
          otp: registrationOtp.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || `HTTP ${res.status}`);
      }

      localStorage.setItem('userProfile', JSON.stringify({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email
      }));

      setRegistrationStatus(data.message || 'Account verified. Sign in to continue.');
      setTimeout(() => navigate('/login'), 900);
    } catch (err) {
      setRegistrationStatus('Verification failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const disabled = loading || googleLoading;

  return (
    <>
      {(loading || googleLoading) && <LoadingSpinner />}
      <div className="lg-page">
        <div className="lg-dots" />
        <div className="lg-watermark">
          <img src={logo} alt="" className="lg-watermark-img" />
        </div>

        <span className="lg-back-link" onClick={() => navigate('/')}>Back</span>

        <div className="lg-card lg-card-register">
          <div className="lg-brand">
            <div className="lg-brand-name">cerbyl</div>
          </div>

          <div className="lg-title">
            {verificationStep === 'verify' ? 'Verify your account' : 'Create your account'}
          </div>

          {verificationStep === 'form' && (
            <>
              <button
                className="lg-google-btn"
                onClick={handleGoogleSignIn}
                disabled={disabled}
              >
                {googleLoading ? (
                  <>
                    <div className="lg-spinner" />
                    <span>Signing in...</span>
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
                <div className="lg-name-row">
                  <div className="lg-field">
                    <input
                      type="text"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleChange}
                      className="lg-input"
                      placeholder="First name"
                      required
                      disabled={disabled}
                    />
                  </div>
                  <div className="lg-field">
                    <input
                      type="text"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleChange}
                      className="lg-input"
                      placeholder="Last name"
                      required
                      disabled={disabled}
                    />
                  </div>
                </div>
                <div className="lg-field">
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="lg-input"
                    placeholder="Email"
                    required
                    disabled={disabled}
                  />
                </div>
                <div className="lg-field">
                  <input
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    className="lg-input"
                    placeholder="Username"
                    required
                    disabled={disabled}
                  />
                </div>
                <div className="lg-field">
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    className="lg-input"
                    placeholder="Password"
                    required
                    disabled={disabled}
                  />
                </div>
                <div className="lg-field">
                  <input
                    type="password"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="lg-input"
                    placeholder="Confirm password"
                    required
                    disabled={disabled}
                  />
                </div>
                <button type="submit" className="lg-submit" disabled={disabled}>
                  {loading ? 'Sending OTP...' : 'Create Account'}
                </button>
              </form>
            </>
          )}

          {verificationStep === 'verify' && (
            <form onSubmit={handleVerifyRegistration} className="lg-form">
              <div className="lg-field">
                <input
                  type="text"
                  value={registrationOtp}
                  onChange={(e) => setRegistrationOtp(e.target.value)}
                  className="lg-input"
                  placeholder="6-digit OTP"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  disabled={disabled}
                />
              </div>
              <button type="submit" className="lg-submit" disabled={disabled}>
                {loading ? 'Verifying...' : 'Verify Account'}
              </button>
              <button
                type="button"
                className="lg-forgot-btn"
                onClick={() => {
                  setVerificationStep('form');
                  setRegistrationOtp('');
                  setRegistrationStatus('');
                }}
                disabled={disabled}
              >
                Edit registration details
              </button>
            </form>
          )}

          {registrationStatus && (
            <div className="lg-reset-status">{registrationStatus}</div>
          )}

          <div className="lg-footer">
            Already have an account?
            <span className="lg-link" onClick={() => navigate('/login')}>Sign in</span>
          </div>
        </div>
      </div>
    </>
  );
}

export default Register;
