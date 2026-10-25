import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, X, Radio } from 'lucide-react';

interface VoiceModeOrbProps {
  isOpen: boolean;
  onClose: () => void;
  onSendMessage: (text: string) => Promise<void>;
  botName: string;
  avatar: string;
}

export const VoiceModeOrb: React.FC<VoiceModeOrbProps> = ({
  isOpen,
  onClose,
  onSendMessage,
  botName,
  avatar
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [statusText, setStatusText] = useState('Listening for instructions...');
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (!isOpen) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsListening(false);
      setIsSpeaking(false);
      return;
    }

    // Initialize Web Speech Recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setStatusText(`Listening to you... (hands-free @${botName})`);
      };

      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscript(currentTranscript);

        // If final result captured, dispatch to agent
        if (event.results[event.results.length - 1].isFinal && currentTranscript.trim().length > 3) {
          const finalMsg = currentTranscript.trim();
          setStatusText(`Processing: "${finalMsg}"...`);
          setTranscript('');
          onSendMessage(finalMsg).then(() => {
            speakText(`Got it. Working on: ${finalMsg}`);
          }).catch(console.error);
        }
      };

      recognition.onerror = (err: any) => {
        console.warn('Speech recognition status:', err.error);
        if (err.error === 'not-allowed') {
          setStatusText('Microphone access denied. Click mic icon to allow.');
        }
      };

      recognition.onend = () => {
        if (isOpen) {
          try {
            recognition.start();
          } catch {}
        }
      };

      try {
        recognition.start();
        recognitionRef.current = recognition;
      } catch (e) {
        console.warn('Could not auto-start speech recognition:', e);
      }
    } else {
      setStatusText('Speech recognition requires Chrome/Edge runtime.');
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isOpen]);

  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    
    // Pick natural voice if available
    const voices = window.speechSynthesis.getVoices();
    const naturalVoice = voices.find((v) => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Neural')));
    if (naturalVoice) utterance.voice = naturalVoice;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  const toggleMic = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setIsListening(false);
      setStatusText('Microphone paused');
    } else {
      try {
        recognitionRef.current.start();
      } catch {}
      setIsListening(true);
      setStatusText('Listening...');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-2xl animate-fade-in select-none">
      {/* Precision Modal Container */}
      <div className="relative w-full max-w-lg p-8 flex flex-col items-center text-center space-y-6">
        {/* Top Dismiss Button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-zinc-500 hover:text-white p-2 rounded-xl hover:bg-white/[0.08] transition"
          title="Exit Voice Mode"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Coworker Tag */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.06] border border-white/[0.08] text-xs font-mono text-zinc-300">
          <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span>Real-Time Voice Stream · @{botName}</span>
        </div>

        {/* Ambient Quantum Orb Visualizer */}
        <div className="relative flex items-center justify-center w-52 h-52 my-4">
          {/* Outer Breathing Aura */}
          <div
            className={`absolute inset-0 rounded-full blur-3xl transition-all duration-700 ${
              isSpeaking
                ? 'bg-gradient-to-tr from-cyan-500 via-indigo-600 to-emerald-400 opacity-60 scale-125 animate-pulse'
                : isListening
                ? 'bg-gradient-to-tr from-cyan-500 via-purple-600 to-blue-500 opacity-40 scale-110 animate-spin'
                : 'bg-zinc-800 opacity-20 scale-90'
            }`}
          />

          {/* Middle Wave Ring */}
          <div
            className={`absolute w-44 h-44 rounded-full border border-cyan-400/30 transition-transform duration-500 ${
              isSpeaking || isListening ? 'scale-110 animate-ping opacity-25' : 'scale-95 opacity-10'
            }`}
          />

          {/* Central Glowing Core Orb */}
          <div className="relative w-36 h-36 rounded-full bg-gradient-to-b from-[#181822] via-[#0d0d14] to-[#050508] border border-white/20 shadow-[0_0_50px_rgba(34,211,238,0.25)] flex items-center justify-center overflow-hidden">
            <span className="text-4xl filter drop-shadow-[0_0_12px_rgba(255,255,255,0.4)] animate-bounce">
              {avatar}
            </span>
          </div>
        </div>

        {/* Live Audio Status & Dynamic Waveform Simulation */}
        <div className="space-y-2 max-w-sm">
          <div className="flex items-center justify-center gap-1 h-6">
            {[40, 70, 100, 60, 90, 45, 80, 50, 95, 30].map((h, i) => (
              <span
                key={i}
                style={{
                  height: (isListening || isSpeaking) ? `${Math.max(15, Math.round(h * Math.random()))}%` : '20%',
                  transition: 'height 150ms ease'
                }}
                className={`w-1 rounded-full ${
                  isSpeaking ? 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]' : 'bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]'
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-zinc-400 font-medium">{statusText}</p>
          {transcript && (
            <p className="text-sm font-semibold text-white bg-white/[0.05] p-3 rounded-xl border border-white/[0.08] shadow-inner animate-springEnter">
              "{transcript}"
            </p>
          )}
        </div>

        {/* Control Action Buttons */}
        <div className="flex items-center gap-3 pt-4">
          <button
            onClick={toggleMic}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition shadow-lg pressable ${
              isListening
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30'
                : 'bg-zinc-800 text-zinc-400 border border-white/[0.08] hover:text-white'
            }`}
            title={isListening ? 'Mute Microphone' : 'Unmute Microphone'}
          >
            {isListening ? <Mic className="w-5 h-5 animate-pulse" /> : <MicOff className="w-5 h-5" />}
          </button>

          <button
            onClick={() => speakText(`Hello! I'm ${botName}, your digital coworker. You can speak commands directly.`)}
            className="w-12 h-12 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-zinc-300 hover:text-white flex items-center justify-center transition shadow-lg pressable"
            title="Test Voice Response"
          >
            <Volume2 className="w-5 h-5" />
          </button>
        </div>

        <p className="text-[11px] text-zinc-500 font-mono">
          Hands-free Voice Mode · Powered by Grok/Muse-style low-latency audio stream
        </p>
      </div>
    </div>
  );
};
