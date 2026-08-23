import { useState } from 'react';
import Current from './pages/Current.js';
import Tickets from './pages/Tickets.js';
import Capacity from './pages/Capacity.js';
import Changes from './pages/Changes.js';
import Settings from './pages/Settings.js';

const tabs = ['Current', 'Tickets', 'Capacity', 'Changes', 'Settings'] as const;
type Tab = (typeof tabs)[number];

const pages: Record<Tab, () => JSX.Element> = {
  Current,
  Tickets,
  Capacity,
  Changes,
  Settings,
};

export default function App() {
  const [tab, setTab] = useState<Tab>('Current');
  const Page = pages[tab];

  return (
    <div className="min-h-screen bg-[#0f1117]">
      <header className="border-b border-slate-800/80 bg-[#0f1117]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-slate-100">SprintOS</h1>
            <p className="text-sm text-slate-500">Sprint cockpit</p>
          </div>
          <nav className="tab-list" aria-label="Main navigation">
            {tabs.map((name) => (
              <button
                key={name}
                type="button"
                className={tab === name ? 'tab-button tab-button-active' : 'tab-button'}
                aria-current={tab === name ? 'page' : undefined}
                onClick={() => setTab(name)}
              >
                {name}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="app-shell">
        <Page />
      </main>
    </div>
  );
}
