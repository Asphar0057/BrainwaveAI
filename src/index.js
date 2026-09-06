import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './App';
import './index.css';
import { installFetchInterceptor } from './utils/fetchInterceptor';

installFetchInterceptor();

if (typeof window !== 'undefined') {
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = window.__REACT_DEVTOOLS_GLOBAL_HOOK__ || {};
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__.inject = function() {};
}

const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);
// Data-router navigation blockers protect pending note edits, including browser Back.
const router = createBrowserRouter([{ path: '*', element: <App /> }], {
  future: { v7_relativeSplatPath: true }
});
root.render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);
