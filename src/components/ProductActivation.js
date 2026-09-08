import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { productRequest } from '../services/productService';
export default function ProductActivation() {
  const location = useLocation(); const recorded = useRef(null);
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || recorded.current === token) return;
    recorded.current = token;
    const visitor = localStorage.getItem('cerbyl.sample.visitor');
    productRequest('/product/activation', { method: 'POST', body: JSON.stringify({ visitor_id: visitor || null }) }).catch(() => { if (recorded.current === token) recorded.current = null; });
  }, [location.pathname]);
  return null;
}
