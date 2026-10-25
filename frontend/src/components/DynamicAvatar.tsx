import React from 'react';

export type AgentState = 'idle' | 'thinking' | 'running' | 'waiting_approval' | 'offline';

interface DynamicAvatarProps {
  avatar: string;
  name: string;
  role?: string;
  status?: AgentState;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showGlow?: boolean;
}

export const DynamicAvatar: React.FC<DynamicAvatarProps> = ({
  avatar,
  name,
  role,
  status = 'idle',
  size = 'md',
  showGlow = true
}) => {
  // Size styles
  const sizeMap = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
    xl: 'w-14 h-14 text-2xl'
  };

  const ringSizeMap = {
    sm: 'p-[1.5px]',
    md: 'p-[2px]',
    lg: 'p-[2.5px]',
    xl: 'p-[3px]'
  };

  const indicatorSizeMap = {
    sm: 'w-1.5 h-1.5 -bottom-0.5 -right-0.5',
    md: 'w-2 h-2 -bottom-0.5 -right-0.5',
    lg: 'w-2.5 h-2.5 bottom-0 right-0',
    xl: 'w-3.5 h-3.5 bottom-0.5 right-0.5'
  };

  // State-specific styles
  const getRingStyle = () => {
    switch (status) {
      case 'thinking':
        return 'bg-gradient-to-tr from-cyan-400 via-indigo-500 to-purple-500 animate-spin';
      case 'running':
        return 'bg-gradient-to-r from-amber-400 via-emerald-400 to-cyan-400 animate-pulse';
      case 'waiting_approval':
        return 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.9)] animate-bounce';
      case 'idle':
        return 'bg-gradient-to-b from-white/20 to-white/5';
      case 'offline':
      default:
        return 'bg-zinc-800';
    }
  };

  const getIndicatorStyle = () => {
    switch (status) {
      case 'thinking':
        return 'bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.9)] animate-pulse';
      case 'running':
        return 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.9)] animate-ping';
      case 'waiting_approval':
        return 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.9)]';
      case 'idle':
        return 'bg-emerald-400 shadow-[0_0_5px_rgba(16,185,129,0.7)]';
      case 'offline':
      default:
        return 'bg-zinc-600';
    }
  };

  const getContainerGlow = () => {
    if (!showGlow) return '';
    switch (status) {
      case 'thinking':
        return 'shadow-[0_0_16px_rgba(34,211,238,0.35)]';
      case 'running':
        return 'shadow-[0_0_16px_rgba(16,185,129,0.35)]';
      case 'waiting_approval':
        return 'shadow-[0_0_20px_rgba(244,63,94,0.45)]';
      default:
        return 'shadow-xs';
    }
  };

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 group ${getContainerGlow()}`}
      title={`${name}${role ? ` (${role})` : ''} · ${status.toUpperCase()}`}
    >
      {/* Outer Animated Ring */}
      <div className={`rounded-xl ${ringSizeMap[size]} ${getRingStyle()} flex items-center justify-center`}>
        {/* Inner Avatar Box */}
        <div
          className={`${sizeMap[size]} rounded-[10px] bg-[#111116] border border-white/10 flex items-center justify-center select-none overflow-hidden transition-transform duration-200 group-hover:scale-105`}
        >
          <span className="leading-none">{avatar}</span>
        </div>
      </div>

      {/* Floating Status Indicator Pill */}
      <span
        className={`absolute rounded-full ring-2 ring-[#050507] ${indicatorSizeMap[size]} ${getIndicatorStyle()}`}
      />
    </div>
  );
};
