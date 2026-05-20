import React from 'react';

interface ErrorBoxProps {
  message: string;
  onDismiss?: () => void;
}

export const ErrorBox: React.FC<ErrorBoxProps> = ({ message, onDismiss }) => (
  <div className="error-box">
    <span className="error-message">{message}</span>
    {onDismiss && <button onClick={onDismiss} className="dismiss-btn">Schliessen</button>}
  </div>
);
