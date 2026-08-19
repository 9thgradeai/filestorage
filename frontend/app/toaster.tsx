'use client';

import { Toaster } from 'react-hot-toast';

export default function ToasterProvider() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        className: 'toast-box',
        success: { duration: 2500 },
        error: { duration: 4000 },
      }}
    />
  );
}