import './LoadingSpinner.css';

const LoadingSpinner = () => {
  return (
    <div className="loading-spinner-overlay" role="status" aria-label="Loading page">
      <div className="loading-spinner-container" aria-hidden="true">
        <div className="loading-spinner-cube loading-spinner-cube--1"></div>
        <div className="loading-spinner-cube loading-spinner-cube--2"></div>
        <div className="loading-spinner-cube loading-spinner-cube--3"></div>
      </div>
    </div>
  );
};

export default LoadingSpinner;
