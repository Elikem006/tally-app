import { useState } from 'react';
import { ToastType } from '../components/Toast';

export function useToast() {
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<ToastType>('info');

  function showToast(message: string, type: ToastType = 'info') {
    setToastMessage(message);
    setToastType(type);
    setToastVisible(true);
  }

  function hideToast() {
    setToastVisible(false);
  }

  return { showToast, toastMessage, toastType, toastVisible, hideToast };
}
