import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import NProgress from 'nprogress';
import 'nprogress/nprogress.css';

NProgress.configure({ showSpinner: false, minimum: 0.1 });

export default function TopProgressBar() {
  const location = useLocation();

  useEffect(() => {
    NProgress.start();
    const timeout = setTimeout(() => {
      NProgress.done();
    }, 500); // Simulate page load time, mostly it just flashes to show navigation

    return () => {
      clearTimeout(timeout);
      NProgress.done();
    };
  }, [location.pathname, location.search]);

  return (
    <style>{`
      #nprogress .bar {
        background: var(--highland-gold, #D4AF37) !important;
        height: 3px !important;
      }
      #nprogress .peg {
        box-shadow: 0 0 10px var(--highland-gold, #D4AF37), 0 0 5px var(--highland-gold, #D4AF37) !important;
      }
    `}</style>
  );
}
