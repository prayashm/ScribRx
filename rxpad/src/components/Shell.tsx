import { route } from 'preact-router';
import type { ComponentChildren } from 'preact';

interface Props {
  children: ComponentChildren;
  activeTab?: string;
}

const tabs = [
  { path: '/', label: 'New Rx', icon: PlusIcon },
  { path: '/history', label: 'History', icon: ClockIcon },
  { path: '/settings', label: 'Settings', icon: GearIcon },
];

export function Shell({ children, activeTab }: Props) {
  return (
    <div class="flex flex-col h-full bg-gray-50">
      <div class="flex-1 overflow-y-auto pb-20">{children}</div>
      <nav class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around items-center h-16 z-50">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.path;
          return (
            <button
              key={tab.path}
              onClick={() => route(tab.path)}
              class={`flex flex-col items-center gap-0.5 px-4 py-2 ${
                isActive ? 'text-blue-600' : 'text-gray-400'
              }`}
            >
              <tab.icon active={isActive} />
              <span class="text-xs font-medium">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function PlusIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? '#2563EB' : '#9CA3AF'} stroke-width="2" stroke-linecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ClockIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? '#2563EB' : '#9CA3AF'} stroke-width="2" stroke-linecap="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function GearIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? '#2563EB' : '#9CA3AF'} stroke-width="2" stroke-linecap="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
