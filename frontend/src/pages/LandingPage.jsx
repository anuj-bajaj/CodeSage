import React, { useState, useEffect } from 'react'
import { API_BASE_URL } from '../config'
import { Link } from 'react-router-dom'
import { ArrowRight, Github, Code, RefreshCw, Eye, Sparkles, Database } from 'lucide-react'
import PageGlow from '../components/PageGlow'
import Logo from '../components/Logo'

import { useApp } from '../context/AppContext'

const LandingPage = () => {
    const { statsVersion } = useApp()
    const [vectorCount, setVectorCount] = useState(null)
    const [liveStats, setLiveStats] = useState({ repos: 0, vectors: 0, languages: 0 })
    const themeColor = '#ef4444'

    useEffect(() => {
        Promise.all([
            fetch(`${API_BASE_URL}/api/repos`).then(r => r.json()),
            fetch(`${API_BASE_URL}/api/stats`).then(r => r.json())
        ]).then(([repos, stats]) => {
            setLiveStats({
                repos: repos.length,
                vectors: stats.total_vectors,
                languages: [...new Set(repos.flatMap(r => r.languages || []))].length
            })
            setVectorCount(stats.total_vectors)
        }).catch(() => { })
    }, [statsVersion])

    return (
        <PageGlow colorA={themeColor} colorB="#f43f5e">
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                paddingTop: '20px'
            }}>
                {/* Hero Content Area */}
                <div style={{ textAlign: 'center', maxWidth: '800px', marginBottom: '60px' }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: '20px',
                        padding: '6px 12px',
                        color: themeColor,
                        fontSize: '12px',
                        fontWeight: 600,
                        marginBottom: '24px'
                    }}>
                        <Sparkles size={12} />
                        <span>Semantic AST Codebase Parsing</span>
                    </div>

                    <div style={{ marginBottom: '28px' }}>
                        <Logo size="lg" />
                    </div>

                    <p style={{
                        fontSize: '20px',
                        color: 'var(--text-muted)',
                        lineHeight: '1.5',
                        marginBottom: '36px',
                        fontWeight: 400
                    }}>
                        Understand any codebase instantly. Ask questions, trace answers, ship faster.
                    </p>

                    {/* Call to Action Buttons */}
                    <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginBottom: '24px' }}>
                        <Link to="/app" className="btn-primary" style={{
                            width: 'auto',
                            padding: '12px 24px',
                            backgroundColor: themeColor,
                            color: '#0d1117',
                            borderColor: themeColor,
                            borderRadius: '6px',
                            fontSize: '15px'
                        }}>
                            <span>Launch App</span>
                            <ArrowRight size={16} />
                        </Link>

                        <a href="https://github.com/anuj-bajaj/CodeSage" target="_blank" rel="noopener noreferrer" style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: 'transparent',
                            border: '1px solid var(--border)',
                            color: 'var(--text)',
                            borderRadius: '6px',
                            padding: '12px 24px',
                            textDecoration: 'none',
                            fontSize: '15px',
                            fontWeight: 600,
                            transition: 'all 0.15s ease'
                        }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                        >
                            <Github size={16} />
                            <span>View on GitHub</span>
                        </a>
                    </div>

                    {/* Dynamic Live Metadata Stats Pill Row */}
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: '30px',
                        padding: '6px 14px',
                        fontSize: '12px',
                        color: 'var(--text-muted)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                    }}>
                        <span style={{ color: themeColor, fontWeight: 600 }}>{liveStats.repos}</span> repositories indexed
                        <span style={{ color: 'var(--border)', margin: '0 4px' }}>·</span>
                        <span style={{ color: themeColor, fontWeight: 600 }}>{liveStats.vectors.toLocaleString()}</span> total vectors
                        <span style={{ color: 'var(--border)', margin: '0 4px' }}>·</span>
                        <span style={{ color: themeColor, fontWeight: 600 }}>{liveStats.languages}</span> languages detected
                    </div>
                </div>

                {/* Premium Mock Terminal Console */}
                <div className="fullscreen-box" style={{
                    width: '100%',
                    maxWidth: '700px',
                    padding: '0',
                    overflow: 'hidden',
                    marginBottom: '80px',
                    textAlign: 'left'
                }}>
                    <div style={{
                        backgroundColor: 'var(--surface)',
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex',
                        gap: '6px',
                        alignItems: 'center'
                    }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#f85149' }} />
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#d4a72c' }} />
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#2ea44f' }} />
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginLeft: '12px' }}>
                            bash — CodeSage CLI Q&A
                        </span>
                    </div>
                    <div style={{
                        fontFamily: 'var(--font-mono)',
                        padding: '20px',
                        fontSize: '13px',
                        lineHeight: '1.6',
                        backgroundColor: '#070a0e'
                    }}>
                        <div className="terminal-query" style={{ color: themeColor, marginBottom: '14px' }}>
                            &gt; What does the authenticate() function do?
                        </div>
                        <div style={{ color: 'var(--text)', marginBottom: '16px' }}>
                            <span style={{ color: themeColor, fontWeight: 'bold' }}>CodeSage:</span> The <code style={{ backgroundColor: 'var(--border)', padding: '2px 4px', borderRadius: '3px' }}>authenticate()</code> function (<span style={{ textDecoration: 'underline' }}>auth/middleware.py</span>, L23-45) validates JWT tokens by checking the signature against the secret key and verifying expiry. It raises <code style={{ backgroundColor: 'var(--border)', padding: '2px 4px', borderRadius: '3px' }}>HTTPException 401</code> if invalid.
                        </div>
                        <div style={{
                            borderLeft: '2px solid ' + themeColor,
                            paddingLeft: '12px',
                            color: 'var(--text-muted)',
                            fontSize: '12px',
                            backgroundColor: 'var(--surface)',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            border: '1px solid var(--border)'
                        }}>
                            <span style={{ fontWeight: 'bold', color: 'var(--text)' }}>Sources:</span> auth/middleware.py L23-45 <span style={{ color: themeColor, fontSize: '10px', border: '1px solid var(--border)', padding: '0 4px', borderRadius: '10px', marginLeft: '6px' }}>function</span>
                        </div>
                    </div>
                </div>

                {/* How it Works Horizontal Path */}
                <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '40px', color: '#fff' }}>How It Works</h2>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: '20px',
                    width: '100%',
                    maxWidth: '800px',
                    marginBottom: '80px',
                    textAlign: 'center'
                }}>
                    {[
                        { icon: '①', title: 'Clone Repo', desc: 'Shallow clones public projects' },
                        { icon: '②', title: 'Tree-sitter Parse', desc: 'Extracts classes and methods' },
                        { icon: '③', title: 'Hybrid Search', desc: 'Dense + BM25 retrieve match' },
                        { icon: '④', title: 'Traced Answer', desc: 'Answers mapped directly to file lines' }
                    ].map((step, idx) => (
                        <div key={idx} style={{
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            padding: '20px 12px',
                            borderRadius: '8px'
                        }}>
                            <span style={{ fontSize: '24px', color: themeColor, display: 'block', marginBottom: '8px' }}>{step.icon}</span>
                            <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px', color: '#fff' }}>{step.title}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>{step.desc}</div>
                        </div>
                    ))}
                </div>

                {/* Feature Cards Grid */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '24px',
                    width: '100%',
                    maxWidth: '900px',
                    marginBottom: '80px'
                }}>
                    {[
                        {
                            icon: <Code size={20} color={themeColor} />,
                            title: 'Code-Aware Chunking',
                            desc: 'Parses structural signatures using Tree-sitter, mapping classes and functional entities instead of raw character counts.'
                        },
                        {
                            icon: <RefreshCw size={20} color={themeColor} />,
                            title: 'Hybrid Search + Reranking',
                            desc: 'Calculates structural RRF combined with Cross-Encoder scores to narrow vector candidates down to the top 5 matches.'
                        },
                        {
                            icon: <Eye size={20} color={themeColor} />,
                            title: 'Reasoning Trace',
                            desc: 'Tracks direct source code files and lists matching line boundaries under every response window for auditability.'
                        },
                        {
                            icon: <Database size={20} color={themeColor} />,
                            title: 'Database Statistics',
                            id: 'database-stats-card',
                            desc: `Currently hosting ${vectorCount !== null ? vectorCount.toLocaleString() : '0'} active vector embeddings indexed across loaded developer workspace environments.`
                        }
                    ].map((feat, idx) => (
                        <div key={idx} id={feat.id || undefined} style={{
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            padding: '24px',
                            transition: 'all 0.15s ease'
                        }}>
                            <div style={{ marginBottom: '14px' }}>{feat.icon}</div>
                            <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>{feat.title}</h4>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5' }}>{feat.desc}</p>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <footer style={{
                    borderTop: '1px solid var(--border)',
                    width: '100%',
                    maxWidth: '900px',
                    paddingTop: '24px',
                    paddingBottom: '24px',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '12px',
                    marginTop: 'auto'
                }}>
                    Built with FastAPI · LangChain · Qdrant · React
                </footer>
            </div>
        </PageGlow>
    )
}

export default LandingPage
