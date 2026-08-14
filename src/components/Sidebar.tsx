import { NavLink } from 'react-router-dom';
import { Home, UserCircle, Shirt } from 'lucide-react';
import clsx from 'clsx';
import Updater from './Updater';

export default function Sidebar() {
  const navItems = [
    { path: '/', label: 'Home', icon: <Home size={20} /> },
    { path: '/profiles', label: 'Profile', icon: <UserCircle size={20} /> },
    { path: '/skins', label: 'Skins', icon: <Shirt size={20} /> },
  ];

  return (
    <div className="w-[140px] bg-slate-900/40 border-r border-white/10 flex flex-col pt-6 backdrop-blur-xl h-full">
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) => clsx(
            "px-5 py-3 flex items-center gap-3 font-medium mx-3 my-1 rounded-lg text-sm transition-all duration-300",
            isActive 
              ? "bg-accent text-white shadow-[0_4px_15px_rgba(59,130,246,0.3)]" 
              : "text-white/60 hover:bg-white/5 hover:text-white hover:translate-x-0.5"
          )}
        >
          {item.icon}
          {item.label}
        </NavLink>
      ))}
      <Updater />
    </div>
  );
}
