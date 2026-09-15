import { Link, useLocation } from 'react-router-dom';
import { useEffect } from 'react';

const NotFound = () => {
  const location = useLocation();

  // A 404 is a BUG only when the app itself sent the user here -- a dead <Link>, a stale
  // deep link, a renamed route. A cold hit (typed URL, crawler, old bookmark) is a client
  // error, and Sentry captures console.error as an exception, so reporting those turns
  // every bot that guesses a path into its own issue. react-router stamps 'default' on
  // the entry the tab was opened with; anything else is an in-app navigation. Same rule
  // the edge wrapper follows -- 4xx are never reported.
  const fromInsideTheApp = location.key !== 'default';

  useEffect(() => {
    const report = fromInsideTheApp ? console.error : console.warn;
    report(
      '404 Error: User attempted to access non-existent route:',
      location.pathname,
    );
  }, [location.pathname, fromInsideTheApp]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">404</h1>
        <p className="text-xl text-gray-600 mb-4">Oops Page not found</p>
        <Link to="/" className="text-blue-500 hover:text-blue-700 underline">
          Return to Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
