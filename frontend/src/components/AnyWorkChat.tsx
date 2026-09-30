import React, { useState, useRef, useEffect } from 'react';
import { 
  ArrowUp, 
  Paperclip, 
  Monitor, 
  Settings, 
  Share2, 
  Sparkles, 
  CornerDownRight, 
  CheckCircle2, 
  ChevronDown, 
  ChevronRight, 
  Zap 
} from 'lucide-react';
import type { Bot, Channel, Session, ActivityEvent, ApprovalRequest, Artifact } from '../types';
import { ApprovalPrompt } from './ApprovalPrompt';

interface AnyWorkChatProps {
  activeBot: Bot | null;
  activeChannel: Channel | null;
  activeSession: Session | null;
  events: ActivityEvent[];
  artifacts: Artifact[];
  pendingApproval?: ApprovalRequest;
  onSendMessage: (text: string, files?: File[]) => Promise<void>;
  onToggleComputer: () => void;
  isComputerOpen: boolean;
  onOpenBotSettings: () => void;
  onExportTemplate: () => void;
  onResolveApproval: (decision: 'approved' | 'denied', feedback?: string, alwaysAllow?: boolean) => void;
  isLoading: boolean;
  bots: Bot[];
}

export const AnyWorkChat: React.FC<AnyWorkChatProps> = ({
  activeBot,
  activeChannel,
  activeSession: _activeSession,
  events,
  artifacts: _artifacts,
  pendingApproval,
  onSendMessage,
  onToggleComputer,
  isComputerOpen,
  onOpenBotSettings,
  onExportTemplate,
  onResolveApproval,
  isLoading,
  bots
}) => {
  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [expandedHandoffs, setExpandedHandoffs] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events, pendingApproval]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);

    if (val.endsWith('/')) {
      setShowSkillPicker(true);
      setShowMentionPicker(false);
    } else if (val.endsWith('@')) {
      setShowMentionPicker(true);
      setShowSkillPicker(false);
    } else {
      if (!val.includes('/')) setShowSkillPicker(false);
      if (!val.includes('@')) setShowMentionPicker(false);
    }
  };

  const handleSelectSkill = (skillCmd: string) => {
    setInputText((prev) => prev.replace(/\/$/, '') + `/${skillCmd} `);
    setShowSkillPicker(false);
    textareaRef.current?.focus();
  };

  const handleSelectMention = (botName: string) => {
    setInputText((prev) => prev.replace(/@$/, '') + `@${botName} `);
    setShowMentionPicker(false);
    textareaRef.current?.focus();
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;
    const msg = replyingTo ? `[In reply to: "${replyingTo}"]\n${inputText.trim()}` : inputText.trim();
    setInputText('');
    setReplyingTo(null);
    setShowSkillPicker(false);
    setShowMentionPicker(false);
    await onSendMessage(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  };

  const titleName = activeBot ? activeBot.name : activeChannel ? `#${activeChannel.name}` : 'AnyWork';
  const titleTag = activeBot ? activeBot.role_tag : activeChannel ? `${activeChannel.bot_ids.length} agents` : 'Autonomous OS';
  const avatar = activeBot ? activeBot.avatar : '💬';

  const defaultSkills = [
    { name: 'inbox-triage', desc: 'Scan and categorize priority incoming messages' },
    { name: 'build-spreadsheet', desc: 'Generate multi-sheet Excel model with formulas' },
    { name: 'video-render', desc: 'Write animation script and render media asset' },
    { name: 'deep-research', desc: 'Synthesize competitor data with cited sources' },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-[#09090c] overflow-hidden select-none relative">
      {/* Top Header Bar */}
      <div className="h-14 px-5 border-b border-white/[0.08] flex items-center justify-between bg-black/40 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{avatar}</span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-tight">{titleName}</h2>
              <span className="text-[10px] font-mono text-zinc-400 bg-white/[0.08] px-2 py-0.5 rounded-full border border-white/[0.06]">
                {titleTag}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${
                isLoading ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] animate-pulse' : 'bg-emerald-400'
              }`} />
              <span className="text-[10px] text-zinc-400 font-mono">
                {isLoading ? 'Executing sub-tasks...' : 'Always-on Cloud VM · Ready'}
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggleComputer}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${
              isComputerOpen
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-xs'
                : 'bg-white/[0.05] text-zinc-300 border-white/[0.08] hover:bg-white/[0.1] hover:text-white'
            }`}
            title="Toggle Agent Computer (Browser, Shared Files, Terminal)"
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Computer</span>
          </button>

          {activeBot && (
            <>
              <button
                onClick={onExportTemplate}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition"
                title="Share as Template"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Template</span>
              </button>

              <button
                onClick={onOpenBotSettings}
                className="p-1.5 rounded-xl text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition"
                title="Bot Persona & Memory Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Conversation Stream */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 select-text">
        {/* Welcome Card if no messages */}
        {events.length === 0 && (
          <div className="max-w-xl mx-auto py-12 px-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center">
            <span className="text-4xl mb-3 inline-block">{avatar}</span>
            <h3 className="text-base font-bold text-white tracking-tight">
              {activeBot ? `Chatting with ${activeBot.name}` : `Welcome to ${titleName}`}
            </h3>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed max-w-md mx-auto">
              {activeBot ? activeBot.description : 'Multi-agent channel for team collaboration.'}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <span className="text-[11px] text-zinc-500 font-mono">Tip: Type <b>/</b> for skills or <b>@</b> to delegate to other bots.</span>
            </div>
          </div>
        )}

        {/* Event / Message Feed */}
        {events.map((evt, idx) => {
          const isUser = evt.event_type === 'narration' && evt.message.startsWith('User:');
          const isHandoff = evt.event_type === 'tool_start' && evt.message.includes('swarm_delegate');
          const isArtifact = evt.event_type === 'artifact_created';

          return (
            <div key={evt.id || idx} className="space-y-1">
              {/* Normal Chat Bubble */}
              {!isHandoff && (
                <div className={`flex gap-3 group ${isUser ? 'justify-end' : 'justify-start'}`}>
                  {!isUser && (
                    <div className="w-7 h-7 rounded-lg bg-white/[0.08] flex items-center justify-center text-sm shrink-0 border border-white/[0.06]">
                      {avatar}
                    </div>
                  )}

                  <div className={`max-w-[85%] sm:max-w-2xl rounded-2xl px-4 py-3 text-xs leading-relaxed transition ${
                    isUser
                      ? 'bg-white text-black font-medium shadow-md rounded-br-xs'
                      : 'bg-[#121217] text-zinc-200 border border-white/[0.08] rounded-bl-xs'
                  }`}>
                    {/* Message Header if Agent */}
                    {!isUser && (
                      <div className="flex items-center justify-between pb-1 mb-1 border-b border-white/[0.06]">
                        <span className="font-bold text-[11px] text-zinc-300">{titleName}</span>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                          <button
                            onClick={() => setReplyingTo(evt.message.slice(0, 80))}
                            className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1"
                            title="Reply to this message"
                          >
                            <CornerDownRight className="w-3 h-3" />
                            <span>Reply</span>
                          </button>
                        </div>
                      </div>
                    )}

                    <p className="whitespace-pre-wrap">{evt.message.replace(/^User:\s*/, '')}</p>

                    {/* Deliverable Pill if Artifact Created */}
                    {isArtifact && (
                      <div className="mt-2 pt-2 border-t border-white/[0.08] flex items-center gap-2 text-cyan-400 font-mono text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Deliverable saved to shared workspace. View in Agent Computer.</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* INLINE HANDOFF CARD (Concept 18) */}
              {isHandoff && (
                <div className="my-2 max-w-lg mx-auto p-3 rounded-xl bg-indigo-950/20 border border-indigo-500/30 text-xs">
                  <div 
                    onClick={() => setExpandedHandoffs((prev) => ({ ...prev, [evt.id]: !prev[evt.id] }))}
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2 text-indigo-300 font-medium">
                      <Zap className="w-4 h-4 text-cyan-400 animate-pulse" />
                      <span>{evt.message}</span>
                    </div>
                    {expandedHandoffs[evt.id] ? <ChevronDown className="w-3.5 h-3.5 text-zinc-400" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />}
                  </div>
                  {expandedHandoffs[evt.id] && (
                    <div className="mt-2 pt-2 border-t border-indigo-500/20 text-[11px] text-zinc-400 font-mono">
                      Sub-task assigned to specialist agent. Results will be synthesized back to {titleName}.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Pending Approval / Human Takeover Banner */}
        {pendingApproval && (
          <div className="my-4">
            <ApprovalPrompt
              approval={pendingApproval}
              onResolve={(decision, feedback, alwaysAllow) => onResolveApproval(decision, feedback, alwaysAllow)}
            />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Floating Mention / Skill Pickers */}
      {showSkillPicker && (
        <div className="absolute bottom-20 left-6 right-6 sm:left-12 sm:right-12 max-w-md bg-[#16161e] border border-white/[0.12] rounded-2xl p-2 shadow-2xl z-20 space-y-1">
          <div className="px-2 py-1 text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
            Available Skills (Slash Commands)
          </div>
          {defaultSkills.map((sk) => (
            <button
              key={sk.name}
              onClick={() => handleSelectSkill(sk.name)}
              className="w-full flex items-center justify-between p-2 rounded-xl text-left hover:bg-white/[0.08] transition"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-xs font-mono font-bold text-zinc-200">/{sk.name}</span>
              </div>
              <span className="text-[10px] text-zinc-500 truncate max-w-[200px]">{sk.desc}</span>
            </button>
          ))}
        </div>
      )}

      {showMentionPicker && (
        <div className="absolute bottom-20 left-6 right-6 sm:left-12 sm:right-12 max-w-md bg-[#16161e] border border-white/[0.12] rounded-2xl p-2 shadow-2xl z-20 space-y-1">
          <div className="px-2 py-1 text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
            Delegate to Teammate (@Mentions)
          </div>
          {bots.map((b) => (
            <button
              key={b.id}
              onClick={() => handleSelectMention(b.name)}
              className="w-full flex items-center gap-2.5 p-2 rounded-xl text-left hover:bg-white/[0.08] transition"
            >
              <span className="text-base">{b.avatar}</span>
              <div>
                <p className="text-xs font-semibold text-zinc-200">@{b.name}</p>
                <p className="text-[10px] text-zinc-500">{b.role_tag}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Reply Context Banner */}
      {replyingTo && (
        <div className="px-5 py-2 bg-[#121217] border-t border-white/[0.06] flex items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center gap-2 truncate">
            <CornerDownRight className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="truncate">Replying to: <i>"{replyingTo}"</i></span>
          </div>
          <button onClick={() => setReplyingTo(null)} className="text-zinc-500 hover:text-white text-xs font-bold px-1">
            ✕
          </button>
        </div>
      )}

      {/* Message Input Box */}
      <div className="p-3 sm:p-4 border-t border-white/[0.08] bg-[#070709]">
        <form onSubmit={handleSend} className="max-w-3xl mx-auto flex items-end gap-2 bg-[#121217] border border-white/[0.1] rounded-2xl p-2 focus-within:border-white/20 transition shadow-lg">
          <button
            type="button"
            className="text-zinc-500 hover:text-zinc-300 p-2 rounded-xl hover:bg-white/[0.05] transition"
            title="Attach file to shared workspace"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <textarea
            ref={textareaRef}
            rows={1}
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${titleName}... (type / for skills, @ for agents)`}
            className="flex-1 bg-transparent text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none resize-none py-1.5 max-h-32"
          />

          <button
            type="submit"
            disabled={!inputText.trim() || isLoading}
            className="bg-white text-black hover:bg-zinc-200 disabled:opacity-30 disabled:hover:bg-white p-2 rounded-xl transition shadow-md shrink-0"
            title="Send"
          >
            <ArrowUp className="w-4 h-4 stroke-[2.5]" />
          </button>
        </form>
      </div>
    </div>
  );
};
