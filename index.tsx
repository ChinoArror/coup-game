import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Login from './Login';

const RootComponent = () => {
  const [authenticated, setAuthenticated] = useState(
    localStorage.getItem('coup_auth_token') === 'validated'
  );

  if (!authenticated) {
    return <Login onLogin={() => setAuthenticated(true)} />;
  }
  return <App />;
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>
);