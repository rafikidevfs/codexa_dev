'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { Bot, Loader2, Send, Sparkles, User } from 'lucide-react'
import { useMemo, useState } from 'react'

type CommandAssistantProps = { context: string; onClose: () => void }

export function CommandAssistant({ context, onClose }: CommandAssistantProps) {
  const [input, setInput] = useState('')
  const transport = useMemo(() => new DefaultChatTransport({ api: '/api/assistant', body: { context } }), [context])
  const { messages, sendMessage, status, error } = useChat({ transport })
  const loading = status === 'submitted' || status === 'streaming'

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!input.trim() || loading) return
    const prompt = input.trim()
    setInput('')
    await sendMessage({ text: prompt })
  }

  return <div className="border-t border-white/[0.08] bg-[#0d1118]">
    <div className="flex items-center gap-2 px-4 py-3"><div className="grid size-7 place-items-center rounded-lg bg-blue-500/15 text-blue-300"><Sparkles className="size-3.5" /></div><div><p className="text-xs font-semibold text-slate-200">Assistente Codexa</p><p className="text-[10px] text-slate-500">Pergunte sobre o workspace ou peça ajuda para encontrar um módulo</p></div><button type="button" onClick={onClose} className="ml-auto text-xs text-slate-500 hover:text-slate-200">Fechar</button></div>
    {messages.length > 0 && <div className="max-h-56 space-y-3 overflow-y-auto border-y border-white/[0.06] px-4 py-3">{messages.map((message) => <div key={message.id} className={`flex gap-2 ${message.role === 'user' ? 'justify-end' : ''}`}><div className={`grid size-6 shrink-0 place-items-center rounded-full ${message.role === 'user' ? 'bg-white/[0.08] text-slate-400' : 'bg-blue-500/15 text-blue-300'}`}>{message.role === 'user' ? <User className="size-3" /> : <Bot className="size-3" />}</div><div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-5 ${message.role === 'user' ? 'bg-blue-500/10 text-blue-100' : 'bg-white/[0.04] text-slate-300'}`}>{message.parts.filter((part) => part.type === 'text').map((part, index) => <span key={`${message.id}-${index}`}>{part.text}</span>)}</div></div>)}</div>}
    {error && <p className="px-4 py-2 text-xs text-rose-300">{error.message || 'Não foi possível responder.'}</p>}
    <form onSubmit={submit} className="flex items-center gap-2 p-3"><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Pergunte ao assistente..." aria-label="Mensagem para o assistente" className="h-10 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-400/60" /><button type="submit" disabled={loading || !input.trim()} aria-label="Enviar mensagem" className="grid size-10 place-items-center rounded-lg bg-blue-500 text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-40">{loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}</button></form>
  </div>
}
