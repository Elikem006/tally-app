import { useState } from 'react';
import * as Haptics from 'expo-haptics';
import { ToastType } from '../components/Toast';

export function useToast() {
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<ToastType>('info');

  function showToast(message: string, type: ToastType = 'info') {
    // "Successful submit" is one of the four places the motion phase said
    // haptics belong, but only two paths implemented it — the add-expense
    // SuccessBurst and the MoMo outcome — while sixteen other successful
    // commits (budgets saved, reminder marked paid, settle-up confirmed,
    // member added, category created…) confirmed silently.
    //
    // A success toast is this app's own "it worked" signal, so firing here
    // covers all of them consistently and can't drift at a new call site.
    // Fired centrally for the same reason ConfirmModal fires its own: the
    // one place that knows the outcome, rather than every caller.
    //
    // Deliberately success only. Errors are not in the convention, and the
    // one path that genuinely warrants an error buzz (a failed MoMo payment)
    // already raises it explicitly.
    if (type === 'success') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    setToastMessage(message);
    setToastType(type);
    setToastVisible(true);
  }

  function hideToast() {
    setToastVisible(false);
  }

  return { showToast, toastMessage, toastType, toastVisible, hideToast };
}
