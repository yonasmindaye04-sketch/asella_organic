import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { setTheme } from '../../store/slices/uiSlice';
import type { ThemeMode } from '../../store/slices/uiSlice';

const ThemeToggle: React.FC = () => {
  const dispatch = useDispatch();
  const theme = useSelector((state: RootState) => state.ui.theme);

  const handleToggle = () => {
    const next: ThemeMode = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';
    dispatch(setTheme(next));
  };

  const getIcon = () => {
    switch (theme) {
      case 'dark':
        return 'dark_mode';
      case 'light':
        return 'light_mode';
      case 'system':
        return 'brightness_auto';
    }
  };

  return (
    <button
      onClick={handleToggle}
      className="relative text-on-surface-variant hover:text-on-surface transition-colors"
      title={`Theme: ${theme}`}
    >
      <span className="material-symbols-outlined text-xl">{getIcon()}</span>
    </button>
  );
};

export default ThemeToggle;
