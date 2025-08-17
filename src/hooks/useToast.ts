import React, { useState, useCallback } from 'react';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
}

let toastState: ToastState = { toasts: [] };
let listeners: Array<(state: ToastState) => void> = [];

const notify = () => {
  listeners.forEach(listener => listener(toastState));
};

const addToast = (toast: Omit<Toast, 'id'>) => {
  const id = Math.random().toString(36).substr(2, 9);
  const newToast: Toast = {
    id,
    duration: 5000,
    ...toast,
  };

  toastState.toasts.push(newToast);
  notify();

  // Auto remove after duration
  if (newToast.duration && newToast.duration > 0) {
    setTimeout(() => {
      removeToast(id);
    }, newToast.duration);
  }

  return id;
};

const removeToast = (id: string) => {
  toastState.toasts = toastState.toasts.filter(toast => toast.id !== id);
  notify();
};

export const useToast = () => {
  const [state, setState] = useState<ToastState>(toastState);

  const subscribe = useCallback((listener: (state: ToastState) => void) => {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  }, []);

  // Subscribe to state changes
  React.useEffect(() => {
    const unsubscribe = subscribe(setState);
    return unsubscribe;
  }, [subscribe]);

  const toast = useCallback((props: Omit<Toast, 'id'>) => {
    return addToast(props);
  }, []);

  const dismiss = useCallback((id: string) => {
    removeToast(id);
  }, []);

  return {
    toast,
    dismiss,
    toasts: state.toasts,
  };
};

export { addToast as toast, removeToast as dismissToast };
