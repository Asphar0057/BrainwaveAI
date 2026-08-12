import { useNavigate } from 'react-router-dom';
import './Homepage.css';

const Homepage = () => {
  const navigate = useNavigate();

  return (
    <div className="homepage">
      <div className="homepage-container">
        <div className="login-trigger" onClick={() => navigate('/login')} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/login'); } }}>
          LOGIN
        </div>
        
        <div className="main-content">
          <h1 className="title">
            <img src="/logo.svg" alt="" style={{ height: '64px', marginRight: '16px', verticalAlign: 'middle', filter: 'brightness(0) saturate(100%) invert(77%) sepia(48%) saturate(456%) hue-rotate(359deg) brightness(95%) contrast(89%)' }} />
            Cerbyl
          </h1>
          <p className="subtitle-text">YOUR PERSONALIZED AI TUTOR</p>
          <div className="horizontal-line"></div>
        </div>
      </div>
    </div>
  );
};

export default Homepage;