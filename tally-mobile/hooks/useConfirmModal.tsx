import { useState } from 'react';
import ConfirmModal from '../components/ConfirmModal';

interface ConfirmConfig {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: string;
  icon?: string;
  onConfirm: () => void;
}

/**
 * useConfirmModal — a hook that manages a single reusable ConfirmModal.
 *
 * Usage:
 *   const { showConfirm, ConfirmModalComponent } = useConfirmModal();
 *
 *   // In JSX:
 *   {ConfirmModalComponent}
 *
 *   // To trigger:
 *   showConfirm({
 *     icon: '🗑️',
 *     title: 'Delete Expense',
 *     message: 'Are you sure? This cannot be undone.',
 *     confirmText: 'Delete',
 *     confirmColor: '#E05C5C',
 *     onConfirm: () => handleDelete(item),
 *   });
 */
export function useConfirmModal() {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<ConfirmConfig | null>(null);

  function showConfirm(cfg: ConfirmConfig) {
    setConfig(cfg);
    setVisible(true);
  }

  function handleConfirm() {
    setVisible(false);
    config?.onConfirm();
  }

  function handleCancel() {
    setVisible(false);
  }

  // ConfirmModalComponent is a pre-wired JSX element — drop it anywhere in the tree.
  const ConfirmModalComponent = config ? (
    <ConfirmModal
      visible={visible}
      title={config.title}
      message={config.message}
      confirmText={config.confirmText}
      cancelText={config.cancelText}
      confirmColor={config.confirmColor}
      icon={config.icon}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null;

  return { showConfirm, ConfirmModalComponent };
}
