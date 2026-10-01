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
  Zap,
  CalendarClock,
  BrainCircuit,
  Command,
  FileSpreadsheet,
  Globe,
  Film,
  SearchCode
} from 'lucide-react';
import type { Bot, Channel, Session, ActivityEvent, ApprovalRequest, Artifact } from '../types';
import { api } from '../services/api';
import { ApprovalPrompt } from './ApprovalPrompt';

const DEFAULT_SLASH_SKILLS = [
  { name: 'inbox-triage', desc: 'Scan and categorize priority incoming messages', icon: Zap },
  { name: 'build-spreadsheet', desc: 'Generate multi-sheet Excel model with formulas', icon: FileSpreadsheet },
  { name: 'video-render', desc: 'Write animation script and render media asset', icon: Film },
  { name: 'deep-research', desc: 'Synthesize competitor data with cited sources', icon: Globe },
  { name: 'code-review', desc: 'Audit pull request diffs and security', icon: SearchCode }
];

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
  onOpenRoutinesModal?: () => void;
  onOpenMemoryModal?: () => void;
  onOpenSkillsModal?: () => void;
}

export const AnyWorkChat: React.FC<AnyWorkChatProps> = ({
  activeBot,
  activeChannel,
  activeSession,
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
  bots,
  onOpenRoutinesModal,
  onOpenMemoryModal,
  onOpenSkillsModal
}) => {
  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [availableSkills, setAvailableSkills] = useState<Array<{ name: string; desc: string; icon?: any }>>(DEFAULT_SLASH_SKILLS);
  const [expandedHandoffs, setExpandedHandoffs] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);

  useEffect(() => {
    api.listSkills().then((data) => {
      if (data && data.length > 0) {
        const custom = data.map((d) => ({
          name: d.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
          desc: d.description || 'Custom autonomous workflow',
          icon: Sparkles
        }));
        setAvailableSkills((prev) => {
          const names = new Set(custom.map((c) => c.name));
          return [...custom, ...prev.filter((p) => !names.has(p.name))];
        });
      }
    }).catch(console.error);
  }, []);

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
    if ((!inputText.trim() && attachedFiles.length === 0) || isLoading) return;
    const msg = replyingTo ? `[In reply to: "${replyingTo}"]\n${inputText.trim()}` : (inputText.trim() || 'Process attached file.');
    const filesToSend = [...attachedFiles];
    setInputText('');
    setAttachedFiles([]);
    setReplyingTo(null);
    setShowSkillPicker(false);
    setShowMentionPicker(false);
    await onSendMessage(msg, filesToSend);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  };

  const titleName = activeBot ? activeBot.name : activeChannel ? `#${activeChannel.name}` : 'AnyWork';
  const titleTag = activeBot ? activeBot.role_tag : activeChannel ? `${activeChannel.bot_ids.length} agents` : 'Autonomous OS';
  const avatar = activeBot ? activeBot.avatar : '🤖';

  // Contextual starter prompts
  const starterPrompts = [
    { title: 'Triage Priority Inbox', prompt: '/inbox-triage Scan and draft responses for urgent clients' },
    { title: 'Synthesize Market Brief', prompt: '/deep-research Benchmark top 5 competitor features and pricing' },
    { title: 'Build Financial Model', prompt: '/build-spreadsheet Generate multi-tab Excel model with formulas' },
    { title: 'Pull Request Code Audit', prompt: '/code-review Inspect git diff and verify security compliance' }
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-[#08080b] overflow-hidden select-none relative">
      {/* Precision Top Header Bar */}
      <div className="h-14 px-5 border-b border-white/[0.07] flex items-center justify-between bg-black/40 backdrop-blur-xl z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-b from-white/15 to-white/5 border border-white/10 flex items-center justify-center text-sm shadow-xs">
            <span className="leading-none">{avatar}</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold text-white tracking-tight">{titleName}</h2>
              <span className="text-[10px] font-mono text-zinc-400 bg-white/[0.05] px-2 py-0.5 rounded-full border border-white/[0.07]">
                {titleTag}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${
                isLoading 
                  ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)] animate-pulse' 
                  : 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.7)]'
              }`} />
              <span className="text-[10px] text-zinc-400 font-mono">
                {isLoading ? 'Executing autonomous task...' : 'Cloud VM · Online & Ready'}
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggleComputer}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition duration-150 border ${
              isComputerOpen
                ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/35 shadow-[0_0_12px_rgba(34,211,238,0.2)]'
                : 'bg-white/[0.04] text-zinc-300 border-white/[0.07] hover:bg-white/[0.08] hover:text-white'
            }`}
            title="Toggle Agent Computer (Browser, Shared Files, Terminal)"
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Computer</span>
          </button>

          {activeBot && (
            <>
              {onOpenRoutinesModal && (
                <button
                  onClick={onOpenRoutinesModal}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-zinc-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] transition"
                  title="Cadence: Scheduled Cron & Inbound Webhooks"
                >
                  <CalendarClock className="w-3.5 h-3.5 text-blue-400" />
                  <span className="hidden sm:inline">Routines</span>
                </button>
              )}

              {onOpenMemoryModal && (
                <button
                  onClick={onOpenMemoryModal}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-zinc-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] transition"
                  title="Context: Dual Workspace vs Individual Memory"
                >
                  <BrainCircuit className="w-3.5 h-3.5 text-purple-400" />
                  <span className="hidden sm:inline">Memory</span>
                </button>
              )}

              {onOpenSkillsModal && (
                <button
                  onClick={onOpenSkillsModal}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-zinc-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] transition"
                  title="Capabilities: Skills Library & Teach a Task"
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="hidden sm:inline">Skills</span>
                </button>
              )}

              <button
                onClick={onExportTemplate}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] transition"
                title="Share as Template"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Template</span>
              </button>

              <button
                onClick={onOpenBotSettings}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] transition"
                title="Bot Persona & Model Settings"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Conversation Stream */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 select-text">
        {/* Modern Prompt Launcher Canvas (Zero-State) */}
        {events.length === 0 && (
          <div className="max-w-2xl mx-auto py-10 px-4 animate-springEnter">
            <div className="p-6 rounded-2xl bg-[#0f0f14] border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
              <div className="flex items-center gap-3.5 mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-b from-white/20 to-white/5 border border-white/15 flex items-center justify-center text-lg shadow-sm">
                  <span>{avatar}</span>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white tracking-tight">
                    {activeBot ? activeBot.name : titleName}
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {activeBot ? activeBot.description : 'Multi-agent orchestration channel.'}
                  </p>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-white/[0.06]">
                <span className="text-[10px] uppercase font-semibold tracking-wider text-zinc-500 mb-2.5 block">
                  Suggested Autonomous Workflows
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {starterPrompts.map((sp, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setInputText(sp.prompt);
                        textareaRef.current?.focus();
                      }}
                      className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.12] transition text-left group pressable"
                    >
                      <div className="flex items-center justify-between text-xs font-medium text-zinc-200 group-hover:text-white">
                        <span>{sp.title}</span>
                        <Command className="w-3 h-3 text-zinc-500 opacity-60 group-hover:opacity-100" />
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-1 line-clamp-1">{sp.prompt}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Event / Message Feed */}
        {events.map((evt, idx) => {
          const isUser = evt.event_type === 'narration' && evt.message.startsWith('User:');
          const isHandoff = evt.event_type === 'tool_start' && evt.message.includes('swarm_delegate');
          const isArtifact = evt.event_type === 'artifact_created';

          return (
            <div key={evt.id || idx} className="space-y-1.5">
              {/* Chat Bubble */}
              {!isHandoff && (
                <div className={`flex gap-3 group ${isUser ? 'justify-end' : 'justify-start'}`}>
                  {!isUser && (
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-b from-white/15 to-white/5 border border-white/10 flex items-center justify-center text-xs shrink-0 mt-0.5 shadow-xs">
                      {avatar}
                    </div>
                  )}

                  <div className={`max-w-[85%] sm:max-w-2xl rounded-2xl px-4 py-3 text-xs leading-relaxed transition ${
                    isUser
                      ? 'bg-white text-black font-medium shadow-[0_2px_8px_rgba(0,0,0,0.3)] rounded-tr-xs'
                      : 'bg-[#111116] text-zinc-200 border border-white/[0.08] shadow-[0_4px_16px_rgba(0,0,0,0.5)] rounded-tl-xs'
                  }`}>
                    {/* Header if Agent */}
                    {!isUser && (
                      <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-white/[0.06]">
                        <span className="font-semibold text-[11px] text-zinc-300">{titleName}</span>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                          <button
                            onClick={() => setReplyingTo(evt.message.slice(0, 80))}
                            className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1 transition"
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
                      <div className="mt-2.5 pt-2.5 border-t border-white/[0.08] flex items-center justify-between bg-cyan-500/[0.06] -mx-2 px-3 py-2 rounded-xl border border-cyan-500/20 text-cyan-300 text-xs">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                          <span className="font-medium">Deliverable ready in Agent Computer</span>
                        </div>
                        {activeSession && (
                          <button
                            onClick={onToggleComputer}
                            className="text-[11px] font-semibold text-white bg-cyan-500/30 hover:bg-cyan-500/40 px-2 py-0.5 rounded-md transition"
                          >
                            Inspect
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* INLINE SWARM HANDOFF CARD */}
              {isHandoff && (
                <div className="my-2 max-w-lg mx-auto p-3 rounded-xl bg-gradient-to-r from-indigo-950/20 to-purple-950/20 border border-indigo-500/30 text-xs shadow-md">
                  <div 
                    onClick={() => setExpandedHandoffs((prev) => ({ ...prev, [evt.id]: !prev[evt.id] }))}
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2 text-indigo-200 font-medium">
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

        {/* Pending Approval / Takeover Banner */}
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
        <div className="absolute bottom-20 left-6 right-6 sm:left-12 sm:right-12 max-w-md bg-[#131318] border border-white/[0.12] rounded-2xl p-2 shadow-[0_24px_64px_rgba(0,0,0,0.9)] z-20 space-y-1 animate-slideDownFade">
          <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
            Available Skills (Slash Commands)
          </div>
          {availableSkills.map((sk) => {
            const SkillIcon = sk.icon || Sparkles;
            return (
              <button
                key={sk.name}
                onClick={() => handleSelectSkill(sk.name)}
                className="w-full flex items-center justify-between p-2 rounded-xl text-left hover:bg-white/[0.08] transition"
              >
                <div className="flex items-center gap-2.5">
                  <SkillIcon className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-xs font-mono font-semibold text-zinc-200">/{sk.name}</span>
                </div>
                <span className="text-[10px] text-zinc-500 truncate max-w-[200px]">{sk.desc}</span>
              </button>
            );
          })}
        </div>
      )}

      {showMentionPicker && (
        <div className="absolute bottom-20 left-6 right-6 sm:left-12 sm:right-12 max-w-md bg-[#131318] border border-white/[0.12] rounded-2xl p-2 shadow-[0_24px_64px_rgba(0,0,0,0.9)] z-20 space-y-1 animate-slideDownFade">
          <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
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
          <button onClick={() => setReplyingTo(null)} className="text-zinc-500 hover:text-white text-xs font-bold px-1 transition">
            ✕
          </button>
        </div>
      )}

      {/* Modern Obsidian Composer Bar */}
      <div className="p-3 sm:p-4 border-t border-white/[0.07] bg-[#050507]">
        <form onSubmit={handleSend} className="max-w-3xl mx-auto flex flex-col bg-gradient-to-b from-[#131318] to-[#0c0c10] border border-white/[0.1] rounded-2xl p-2 focus-within:border-white/30 focus-within:ring-2 focus-within:ring-white/10 transition shadow-[0_12px_36px_rgba(0,0,0,0.7)]">
          {/* File attachment preview chips */}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-2 pb-2 border-b border-white/[0.06] mb-1">
              {attachedFiles.map((file, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-white/[0.08] border border-white/[0.1] rounded-lg px-2 py-1 text-[11px] text-zinc-200">
                  <Paperclip className="w-3 h-3 text-cyan-400" />
                  <span className="truncate max-w-[150px] font-mono">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachedFiles(attachedFiles.filter((_, idx) => idx !== i))}
                    className="text-zinc-500 hover:text-white ml-1 font-bold transition"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2 px-1">
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  setAttachedFiles((prev) => [...prev, ...Array.from(e.target.files || [])]);
                }
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-zinc-400 hover:text-white p-2 rounded-xl hover:bg-white/[0.08] transition pressable"
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
              className="flex-1 bg-transparent text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none resize-none py-1.5 max-h-32 tracking-tight"
            />

            <button
              type="submit"
              disabled={(!inputText.trim() && attachedFiles.length === 0) || isLoading}
              className="bg-white text-black hover:bg-zinc-200 disabled:opacity-25 disabled:hover:bg-white p-2 rounded-xl transition shadow-md shrink-0 pressable active:scale-95"
              title="Send (Enter)"
            >
              <ArrowUp className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </form>
        <div className="max-w-3xl mx-auto flex items-center justify-between px-2 pt-1.5 text-[10px] text-zinc-500 font-mono">
          <span>Enter to send · Shift+Enter for new line</span>
          <span>Cloud VM persistent disk mounted</span>
        </div>
      </div>
    </div>
  );
};
