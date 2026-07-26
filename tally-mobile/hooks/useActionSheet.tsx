import { useState } from 'react';
import { ActionSheet, ActionSheetOption } from '../components/ui/ActionSheet';

interface ActionSheetConfig {
  title?: string;
  message?: string;
  options: ActionSheetOption[];
  cancelLabel?: string;
}

/**
 * useActionSheet — mirrors useConfirmModal's shape exactly, for the same
 * ergonomic reason: one hook call per screen, drop the returned component
 * anywhere in the tree, trigger imperatively.
 *
 * Usage:
 *   const { showActionSheet, ActionSheetComponent } = useActionSheet();
 *
 *   // In JSX:
 *   {ActionSheetComponent}
 *
 *   // To trigger:
 *   showActionSheet({
 *     title: 'Export Expenses',
 *     options: [
 *       { label: 'Export CSV', onPress: exportCsv },
 *       { label: 'Export PDF', onPress: exportPdf },
 *     ],
 *   });
 */
export function useActionSheet() {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<ActionSheetConfig | null>(null);

  function showActionSheet(cfg: ActionSheetConfig) {
    setConfig(cfg);
    setVisible(true);
  }

  function handleCancel() {
    setVisible(false);
  }

  const ActionSheetComponent = config ? (
    <ActionSheet
      visible={visible}
      title={config.title}
      message={config.message}
      options={config.options}
      cancelLabel={config.cancelLabel}
      onCancel={handleCancel}
    />
  ) : null;

  return { showActionSheet, ActionSheetComponent };
}
