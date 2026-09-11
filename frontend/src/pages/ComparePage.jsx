import React, { useState, useEffect, useRef } from 'react'
import { API_BASE_URL } from '../config'
import { Link } from 'react-router-dom'
import { Folder, Send, MessageSquare, AlertCircle, RefreshCw, Trash2, ArrowRight } from 'lucide-react'
import PageGlow from '../components/PageGlow'
import { marked } from 'marked'

const ComparePage = () => {
    const [repos, setRepos] = useState([])
    const [selectedRepoL, setSelectedRepoL] = useState('')
    const [selectedRepoR, setSelectedRepoR] = useState('')
    const [messagesL, setMessagesL] = useState([])
    const [messagesR, setMessagesR] = useState([])
    const [input, setInput] = useState('')
    const [loadingL, setLoadingL] = useState(false)
    const [loadingR, setLoadingR] = useState(false)

    const messagesEndRefL = useRef(null)
    const messagesEndRefR = useRef(null)

    // Expanded source trace card sets
    const [expandedSourcesL, setExpandedSourcesL] = useState(new Set())
    const [expandedSourcesR, setExpandedSourcesR] = useState(new Set())

    useEffect(() => {
        const fetchRepos = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/repos`)
                if (res.ok) {
                    const data = await res.json()
                    setRepos(data)
                    if (data.length > 0) {
                        setSelectedRepoL(data[0].repo_url)
                        if (data.length > 1) {
                            setSelectedRepoR(data[1].repo_url)
                        } else {
                            setSelectedRepoR(data[0].repo_url)
                        }
                    }
                }
            } catch (e) {
                console.error("Error loading repositories:", e)
            }
        }
        fetchRepos()
    }, [])

    useEffect(() => {
        messagesEndRefL.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messagesL])

    useEffect(() => {
        messagesEndRefR.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messagesR])

    const getRepoName = (url) => {
        if (!url) return ""
        try {
            const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url
            const parts = cleanUrl.split('/')
            return parts[parts.length - 1] || url
        } catch (e) {
            return url
        }
    }

    const handleSend = async (e) => {
        e.preventDefault()
        if (!input.trim()) return

        const currentMsg = input
        setInput('')

        // Add user message to both chats
        setMessagesL(prev => [...prev, { role: 'user', content: currentMsg }])
        setMessagesR(prev => [...prev, { role: 'user', content: currentMsg }])

        // Helper to query backend for a selected repo
        const queryRepo = async (repoUrl, history, setMessages, setLoading) => {
            if (!repoUrl) return
            setLoading(true)
            try {
                const cleanHistory = history.map(m => ({ role: m.role, content: m.content }))
                const res = await fetch(`${API_BASE_URL}/api/chat/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        repo_url: repoUrl,
                        message: currentMsg,
                        history: cleanHistory
                    })
                })
                if (res.ok) {
                    const data = await res.json()
                    setMessages(prev => [...prev, {
                        role: 'assistant',
                        content: data.answer,
                        sources: data.reasoning_trace || []
                    }])
                } else {
                    const errText = await res.text()
                    setMessages(prev => [...prev, {
                        role: 'assistant',
                        content: `Error: Failed to query repository context. Details: ${errText}`
                    }])
                }
            } catch (e) {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `Error: Network failed to communicate with the engine. Details: ${e.message}`
                }])
            } finally {
                setLoading(false)
            }
        }

        const runL = queryRepo(selectedRepoL, messagesL, setMessagesL, setLoadingL)
        const runR = queryRepo(selectedRepoR, messagesR, setMessagesR, setLoadingR)

        await Promise.all([runL, runR])
    }

    const toggleSourceL = (index) => {
        setExpandedSourcesL(prev => {
            const next = new Set(prev)
            if (next.has(index)) next.delete(index)
            else next.add(index)
            return next
        })
    }

    const toggleSourceR = (index) => {
        setExpandedSourcesR(prev => {
            const next = new Set(prev)
            if (next.has(index)) next.delete(index)
            else next.add(index)
            return next
        })
    }

    const clearChats = () => {
        setMessagesL([])
        setMessagesR([])
    }

    if (repos.length === 0) {
        return (
            <PageGlow
                colorA="#22c55e"
                colorB="#16a34a"
                eyebrow="Comparison Workspace"
                title="No Workspace Loaded"
                subtitle="Index at least two GitHub repositories to use dual repository comparison."
            >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 40px' }}>
                    <Link to="/app" className="btn-primary" style={{ width: 'auto', padding: '10px 16px', display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
                        <span>Launch Workspace</span>
                        <ArrowRight size={14} />
                    </Link>
                </div>
            </PageGlow>
        )
    }

    if (repos.length === 1) {
        return (
            <PageGlow
                colorA="#22c55e"
                colorB="#16a34a"
                eyebrow="Comparison Workspace"
                title="Only One Workspace Loaded"
                subtitle={`You have "${repos[0].repo_name}" indexed. Index at least one more repository to use dual repository comparison.`}
            >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 40px' }}>
                    <Link to="/app" className="btn-primary" style={{ width: 'auto', padding: '10px 16px', display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
                        <span>Index Another Repository</span>
                        <ArrowRight size={14} />
                    </Link>
                </div>
            </PageGlow>
        )
    }

    const repoNameL = getRepoName(selectedRepoL)
    const repoNameR = getRepoName(selectedRepoR)
    const dynamicTitle = repoNameL && repoNameR ? `${repoNameL} vs ${repoNameR}` : 'Compare Repositories'

    return (
        <PageGlow
            colorA="#22c55e"
            colorB="#16a34a"
            eyebrow="Comparison Workspace"
            title={dynamicTitle}
            subtitle="Ask once, compare answers side by side"
        >
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                backgroundColor: 'transparent',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                marginLeft: '32px',
                marginRight: '32px',
                marginBottom: '32px',
                overflow: 'hidden'
            }}>
                {/* Header controls bar */}
                <div style={{
                    height: '52px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 24px',
                    backgroundColor: 'var(--surface)',
                    flexShrink: 0
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <RefreshCw size={16} color="#22c55e" />
                        <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '13px' }}>Side-by-side Chat</span>
                    </div>
                    <button
                        onClick={clearChats}
                        style={{
                            background: 'transparent',
                            border: '1px solid var(--border)',
                            color: 'var(--text-muted)',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--text)'; e.currentTarget.style.color = 'var(--text)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
                    >
                        <Trash2 size={13} />
                        <span>Clear Chats</span>
                    </button>
                </div>

                {/* Split panels container */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'row',
                    width: '100%',
                    flex: 1,
                    overflow: 'hidden'
                }}>
                    {/* Left repository column panel */}
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        borderRight: '1px solid var(--border)',
                        overflow: 'hidden'
                    }}>
                        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface)' }}>
                            <select
                                value={selectedRepoL}
                                onChange={(e) => setSelectedRepoL(e.target.value)}
                                className="text-input-field"
                                style={{ cursor: 'pointer', fontWeight: 550 }}
                            >
                                {repos.map(r => (
                                    <option key={r.repo_url} value={r.repo_url}>{r.repo_name}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', backgroundColor: '#070a0e', flex: 1, overflowY: 'auto' }}>
                            {messagesL.length === 0 ? (
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', opacity: 0.6 }}>
                                    <MessageSquare size={36} style={{ marginBottom: '12px' }} />
                                    <span style={{ fontSize: '13px' }}>Ask a question below to start comparison.</span>
                                </div>
                            ) : (
                                messagesL.map((msg, index) => {
                                    const isUser = msg.role === 'user'
                                    return (
                                        <div key={index} style={{
                                            alignSelf: isUser ? 'flex-end' : 'flex-start',
                                            maxWidth: '90%',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '6px'
                                        }}>
                                            <div style={{
                                                fontSize: '11px',
                                                color: 'var(--text-muted)',
                                                alignSelf: isUser ? 'flex-end' : 'flex-start',
                                                fontFamily: 'var(--font-mono)'
                                            }}>
                                                {isUser ? 'User' : 'Assistant'}
                                            </div>
                                            <div style={{
                                                backgroundColor: 'var(--surface)',
                                                border: '1px solid var(--border)',
                                                borderLeft: isUser ? '1px solid var(--border)' : '2px solid #22c55e',
                                                borderRadius: '6px',
                                                padding: '12px 16px',
                                                fontSize: '13px',
                                                color: 'var(--text)',
                                                whiteSpace: 'pre-wrap',
                                                lineHeight: '1.5'
                                            }}>
                                                {isUser ? (
                                                    msg.content
                                                ) : (
                                                    <div
                                                        className="markdown-content"
                                                        dangerouslySetInnerHTML={{ __html: (() => { try { return marked.parse(msg.content || "") } catch (e) { return msg.content || "" } })() }}
                                                    />
                                                )}

                                                {!isUser && msg.sources && msg.sources.length > 0 && (
                                                    <div style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                                                        <button
                                                            onClick={() => toggleSourceL(index)}
                                                            style={{ background: 'transparent', border: 'none', color: '#22c55e', cursor: 'pointer', fontSize: '11px', display: 'inline-flex', padding: 0 }}
                                                        >
                                                            {expandedSourcesL.has(index) ? 'Hide Traced Contexts' : `Show Traced Contexts (${msg.sources.length})`}
                                                        </button>
                                                        {expandedSourcesL.has(index) && (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                                                                {msg.sources.map((src, sidx) => (
                                                                    <div key={sidx} style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '6px 8px', fontSize: '11px' }}>
                                                                        <div style={{ fontWeight: 600, color: 'var(--text)' }}>
                                                                            {src.file_path || src.filepath} {src.start_line && src.end_line ? `(L${src.start_line}-${src.end_line})` : ''}
                                                                        </div>
                                                                        <pre style={{ margin: '4px 0 0 0', overflowX: 'auto', maxHeight: '60px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                                                                            <code>{src.content}</code>
                                                                        </pre>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                            {loadingL && (
                                <div style={{ alignSelf: 'flex-start', padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <RefreshCw className="animate-spin" size={12} color="#22c55e" />
                                    <span style={{ color: 'var(--text-muted)' }}>Retrieving code context...</span>
                                </div>
                            )}
                            <div ref={messagesEndRefL} />
                        </div>
                    </div>

                    {/* Right repository column panel */}
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden'
                    }}>
                        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface)' }}>
                            <select
                                value={selectedRepoR}
                                onChange={(e) => setSelectedRepoR(e.target.value)}
                                className="text-input-field"
                                style={{ cursor: 'pointer', fontWeight: 550 }}
                            >
                                {repos.map(r => (
                                    <option key={r.repo_url} value={r.repo_url}>{r.repo_name}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', backgroundColor: '#070a0e', flex: 1, overflowY: 'auto' }}>
                            {messagesR.length === 0 ? (
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', opacity: 0.6 }}>
                                    <MessageSquare size={36} style={{ marginBottom: '12px' }} />
                                    <span style={{ fontSize: '13px' }}>Ask a question below to start comparison.</span>
                                </div>
                            ) : (
                                messagesR.map((msg, index) => {
                                    const isUser = msg.role === 'user'
                                    return (
                                        <div key={index} style={{
                                            alignSelf: isUser ? 'flex-end' : 'flex-start',
                                            maxWidth: '90%',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '6px'
                                        }}>
                                            <div style={{
                                                fontSize: '11px',
                                                color: 'var(--text-muted)',
                                                alignSelf: isUser ? 'flex-end' : 'flex-start',
                                                fontFamily: 'var(--font-mono)'
                                            }}>
                                                {isUser ? 'User' : 'Assistant'}
                                            </div>
                                            <div style={{
                                                backgroundColor: 'var(--surface)',
                                                border: '1px solid var(--border)',
                                                borderLeft: isUser ? '1px solid var(--border)' : '2px solid #22c55e',
                                                borderRadius: '6px',
                                                padding: '12px 16px',
                                                fontSize: '13px',
                                                color: 'var(--text)',
                                                whiteSpace: 'pre-wrap',
                                                lineHeight: '1.5'
                                            }}>
                                                {isUser ? (
                                                    msg.content
                                                ) : (
                                                    <div
                                                        className="markdown-content"
                                                        dangerouslySetInnerHTML={{ __html: (() => { try { return marked.parse(msg.content || "") } catch (e) { return msg.content || "" } })() }}
                                                    />
                                                )}

                                                {!isUser && msg.sources && msg.sources.length > 0 && (
                                                    <div style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                                                        <button
                                                            onClick={() => toggleSourceR(index)}
                                                            style={{ background: 'transparent', border: 'none', color: '#22c55e', cursor: 'pointer', fontSize: '11px', display: 'inline-flex', padding: 0 }}
                                                        >
                                                            {expandedSourcesR.has(index) ? 'Hide Traced Contexts' : `Show Traced Contexts (${msg.sources.length})`}
                                                        </button>
                                                        {expandedSourcesR.has(index) && (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                                                                {msg.sources.map((src, sidx) => (
                                                                    <div key={sidx} style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '6px 8px', fontSize: '11px' }}>
                                                                        <div style={{ fontWeight: 650, color: 'var(--text)' }}>
                                                                            {src.file_path || src.filepath} {src.start_line && src.end_line ? `(L${src.start_line}-${src.end_line})` : ''}
                                                                        </div>
                                                                        <pre style={{ margin: '4px 0 0 0', overflowX: 'auto', maxHeight: '60px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                                                                            <code>{src.content}</code>
                                                                        </pre>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                            {loadingR && (
                                <div style={{ alignSelf: 'flex-start', padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <RefreshCw className="animate-spin" size={12} color="#22c55e" />
                                    <span style={{ color: 'var(--text-muted)' }}>Retrieving code context...</span>
                                </div>
                            )}
                            <div ref={messagesEndRefR} />
                        </div>
                    </div>
                </div>

                {/* Bottom Shared Question input box */}
                <div style={{
                    borderTop: '1px solid var(--border)',
                    padding: '20px 24px',
                    backgroundColor: 'var(--surface)',
                    flexShrink: 0
                }}>
                    <form onSubmit={handleSend} className="chat-input-form">
                        <input
                            type="text"
                            placeholder="Compare: Enter code pattern, structure query or optimization task..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            disabled={loadingL || loadingR}
                            className="chat-text-input"
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || loadingL || loadingR}
                            className={`chat-send-btn ${input.trim() ? 'has-text' : ''}`}
                        >
                            <Send size={16} />
                        </button>
                    </form>
                </div>
            </div>
        </PageGlow>
    )
}

export default ComparePage
