import React, { createContext, useState, useEffect, useContext } from 'react'
import { API_BASE_URL } from '../config'

const AppContext = createContext()

export const AppProvider = ({ children }) => {
    const [repos, setRepos] = useState([]) // list of repo URLs
    const [statsVersion, setStatsVersion] = useState(0)
    const [activeRepo, setActiveRepo] = useState(null) // active repo URL
    const [isIngesting, setIsIngesting] = useState(false)
    const [ingestStatus, setIngestStatus] = useState("")
    const [error, setError] = useState(null)
    const [progress, setProgress] = useState(0)

    // Repository duplicate check states
    const [alreadyIndexed, setAlreadyIndexed] = useState(false)
    const [pendingRepoUrl, setPendingRepoUrl] = useState("")

    // Store chat history per repository with localStorage persistence
    const [chatArchive, setChatArchive] = useState(() => {
        try {
            const saved = localStorage.getItem('codesage_history')
            return saved ? JSON.parse(saved) : {}
        } catch {
            return {}
        }
    })

    // Add useEffect to persist chatArchive on change
    useEffect(() => {
        try {
            localStorage.setItem('codesage_history', JSON.stringify(chatArchive))
        } catch (e) {
            console.error("Failed to save history to localStorage", e)
        }
    }, [chatArchive])

    // Current visible conversation per repository, not persisted to localStorage
    const [activeChatSession, setActiveChatSession] = useState(() => {
        try {
            const saved = sessionStorage.getItem('codesage_active_session')
            return saved ? JSON.parse(saved) : {}
        } catch {
            return {}
        }
    })

    useEffect(() => {
        try {
            sessionStorage.setItem('codesage_active_session', JSON.stringify(activeChatSession))
        } catch (e) {
            console.error("Failed to save active session", e)
        }
    }, [activeChatSession])

    // Show full screen input if no repos are loaded, AND we aren't showing the chat workspace
    const [showFullInput, setShowFullInput] = useState(true)

    // Fetch indexed repos on mount
    useEffect(() => {
        const fetchRepos = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/repos`)
                if (res.ok) {
                    const data = await res.json()
                    const urls = data.map(r => r.repo_url)
                    setRepos(urls)
                    if (urls.length > 0) {
                        const savedActiveRepo = sessionStorage.getItem('codesage_active_repo')
                        const validSavedRepo = savedActiveRepo && urls.includes(savedActiveRepo)
                        setActiveRepo(validSavedRepo ? savedActiveRepo : urls[0])
                        setShowFullInput(false)
                    }
                }
            } catch (e) {
                console.warn("Could not load repo lists:", e)
            }
        }
        fetchRepos()
    }, [])

    useEffect(() => {
        if (activeRepo) {
            sessionStorage.setItem('codesage_active_repo', activeRepo)
        }
    }, [activeRepo])

    const proceedIngestion = async (repoUrl) => {
        setAlreadyIndexed(false)
        setPendingRepoUrl("")
        setIsIngesting(true)
        setError(null)
        setIngestStatus("Initializing cloner...")
        setProgress(0)

        try {
            const response = await fetch(`${API_BASE_URL}/api/ingest/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ repo_url: repoUrl }),
            })

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}))
                throw new Error(errData.detail || "Ingestion request failed.")
            }

            setIngestStatus("Cloning repository in background...")
            setProgress(10)

            let pollAttempts = 0
            const maxPollAttempts = 150 // 150 * 2s = 5 minutes

            const pollInterval = setInterval(async () => {
                pollAttempts++
                if (pollAttempts > maxPollAttempts) {
                    clearInterval(pollInterval)
                    setError("Indexing is taking much longer than expected, or the server may have restarted mid-process. Please try again.")
                    setIsIngesting(false)
                    setIngestStatus("")
                    return
                }

                try {
                    const statusRes = await fetch(`${API_BASE_URL}/api/ingest/status/${repoUrl}`)
                    if (!statusRes.ok) {
                        throw new Error("Could not fetch trace status.")
                    }
                    const data = await statusRes.json()

                    if (data.status === "unknown") {
                        // Skip or keep polling
                    } else if (data.status === "cloning") {
                        setIngestStatus(data.message || "Cloning repository...")
                        setProgress(data.progress || 15)
                    } else if (data.status === "parsing") {
                        setIngestStatus(data.message || "Parsing directory...")
                        setProgress(data.progress || 25)
                    } else if (data.status === "embedding") {
                        setIngestStatus(data.message || "Generating embeddings...")
                        setProgress(data.progress || 50)
                    } else if (data.status === "upserting") {
                        setIngestStatus(data.message || "Storing vectors...")
                        setProgress(data.progress || 75)
                    } else if (data.status === "done") {
                        clearInterval(pollInterval)
                        setIngestStatus("Index Ready!")
                        setProgress(100)

                        setRepos((prev) => {
                            if (prev.includes(repoUrl)) return prev
                            return [...prev, repoUrl]
                        })
                        setActiveRepo(repoUrl)
                        setShowFullInput(false)
                        setIsIngesting(false)
                        setIngestStatus("")
                        setStatsVersion(v => v + 1)
                    } else if (data.status === "error") {
                        clearInterval(pollInterval)
                        throw new Error(data.message || "Extraction process failed.")
                    }
                } catch (e) {
                    clearInterval(pollInterval)
                    setError(e.message)
                    setIsIngesting(false)
                    setIngestStatus("")
                }
            }, 2000)

        } catch (err) {
            setError(err.message)
            setIsIngesting(false)
            setIngestStatus("")
        }
    }

    const handleIngest = async (repoUrl) => {
        setIsIngesting(true)
        setError(null)
        setAlreadyIndexed(false)
        setProgress(0)

        try {
            const checkRes = await fetch(`${API_BASE_URL}/api/repos`)
            if (checkRes.ok) {
                const reposData = await checkRes.json()
                const exists = reposData.some(r => r.repo_url === repoUrl)
                if (exists) {
                    setAlreadyIndexed(true)
                    setPendingRepoUrl(repoUrl)
                    setIsIngesting(false)
                    return
                }
            }
            await proceedIngestion(repoUrl)
        } catch (e) {
            setError(e.message)
            setIsIngesting(false)
        }
    }

    const handleSelectRepo = (repoUrl) => {
        setActiveRepo(repoUrl)
        setShowFullInput(false)
    }

    const handleAddRepoClick = () => {
        setShowFullInput(true)
    }

    const handleSendMessage = async (userMessage) => {
        if (!activeRepo) return

        const currentHistory = activeChatSession[activeRepo] || []
        const archivedHistory = chatArchive[activeRepo] || []
        
        const updatedSessionHistory = [
            ...currentHistory,
            { role: 'user', content: userMessage, timestamp: Date.now() }
        ]
        const updatedArchiveHistory = [
            ...archivedHistory,
            { role: 'user', content: userMessage, timestamp: Date.now() }
        ]

        setActiveChatSession(prev => ({
            ...prev,
            [activeRepo]: updatedSessionHistory
        }))
        setChatArchive(prev => ({
            ...prev,
            [activeRepo]: updatedArchiveHistory
        }))

        const sessionHistoryWithPlaceholder = [
            ...updatedSessionHistory,
            { role: 'assistant', content: '', sources: null, loading: true, timestamp: Date.now() }
        ]
        const archiveHistoryWithPlaceholder = [
            ...updatedArchiveHistory,
            { role: 'assistant', content: '', sources: null, loading: true, timestamp: Date.now() }
        ]

        setActiveChatSession(prev => ({
            ...prev,
            [activeRepo]: sessionHistoryWithPlaceholder
        }))
        setChatArchive(prev => ({
            ...prev,
            [activeRepo]: archiveHistoryWithPlaceholder
        }))

        try {
            const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    repo_url: activeRepo,
                    message: userMessage,
                    history: currentHistory.map(h => ({ role: h.role, content: h.content }))
                }),
            })

            if (!response.ok) {
                throw new Error("Failed to initialize stream.")
            }

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ""
            let assistantText = ""
            let extractedSources = null

            while (true) {
                const { value, done } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop()

                for (const line of lines) {
                    const cleanLine = line.trim()
                    if (!cleanLine) continue

                    const dataStr = cleanLine.startsWith("data:") ? cleanLine.substring(5).trim() : cleanLine
                    if (!dataStr) continue

                    try {
                        const parsed = JSON.parse(dataStr)

                        if (parsed.type === 'context') {
                            extractedSources = parsed.data || []
                            const updateSources = prev => {
                                const hist = [...(prev[activeRepo] || [])]
                                if (hist.length > 0) {
                                    hist[hist.length - 1] = {
                                        ...hist[hist.length - 1],
                                        sources: extractedSources
                                    }
                                }
                                return { ...prev, [activeRepo]: hist }
                            }
                            setActiveChatSession(updateSources)
                            setChatArchive(updateSources)
                        } else if (parsed.type === 'token') {
                            assistantText += parsed.data
                            const updateToken = prev => {
                                const hist = [...(prev[activeRepo] || [])]
                                if (hist.length > 0) {
                                    hist[hist.length - 1] = {
                                        ...hist[hist.length - 1],
                                        content: assistantText,
                                        loading: false
                                    }
                                }
                                return { ...prev, [activeRepo]: hist }
                            }
                            setActiveChatSession(updateToken)
                            setChatArchive(updateToken)
                        } else if (parsed.type === 'done') {
                            const updateDone = prev => {
                                const hist = [...(prev[activeRepo] || [])]
                                if (hist.length > 0) {
                                    hist[hist.length - 1] = {
                                        ...hist[hist.length - 1],
                                        loading: false
                                    }
                                }
                                return { ...prev, [activeRepo]: hist }
                            }
                            setActiveChatSession(updateDone)
                            setChatArchive(updateDone)
                            break
                        } else if (parsed.type === 'error') {
                            const updateErrorMsg = prev => {
                                const hist = [...(prev[activeRepo] || [])]
                                if (hist.length > 0) {
                                    hist[hist.length - 1] = {
                                        ...hist[hist.length - 1],
                                        content: `Error: ${parsed.data}`,
                                        loading: false
                                    }
                                }
                                return { ...prev, [activeRepo]: hist }
                            }
                            setActiveChatSession(updateErrorMsg)
                            setChatArchive(updateErrorMsg)
                            break
                        }
                    } catch (e) {
                        console.warn("Could not parse stream frame:", cleanLine, e)
                    }
                }
            }

        } catch (err) {
            const updateCatchError = prev => {
                const hist = [...(prev[activeRepo] || [])]
                if (hist.length > 0 && hist[hist.length - 1].role === 'assistant') {
                    hist[hist.length - 1] = {
                        ...hist[hist.length - 1],
                        content: `Error: ${err.message}`,
                        loading: false
                    }
                } else {
                    hist.push({ role: 'assistant', content: `Error: ${err.message}`, loading: false, timestamp: Date.now() })
                }
                return { ...prev, [activeRepo]: hist }
            }
            setActiveChatSession(updateCatchError)
            setChatArchive(updateCatchError)
        }
    }

    const deleteRepo = async (repoUrl) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/repos/${encodeURIComponent(repoUrl)}`, {
                method: 'DELETE',
                headers: { 'X-Admin-Key': import.meta.env.VITE_ADMIN_KEY }
            })
            if (res.ok) {
                setRepos(prev => prev.filter(r => r !== repoUrl))
                setChatArchive(prev => {
                    const updated = { ...prev }
                    delete updated[repoUrl]
                    return updated
                })
                setActiveChatSession(prev => {
                    const updated = { ...prev }
                    delete updated[repoUrl]
                    return updated
                })
                if (activeRepo === repoUrl) {
                    setActiveRepo(null)
                    setShowFullInput(true)
                }
                setStatsVersion(v => v + 1)
                return true
            }
            return false
        } catch (e) {
            console.error("Failed to delete repo", e)
            return false
        }
    }

    const clearAllData = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/repos/all`, {
                method: 'DELETE',
                headers: { 'X-Admin-Key': import.meta.env.VITE_ADMIN_KEY }
            })
            if (res.ok) {
                setRepos([])
                setActiveRepo(null)
                setChatArchive({})
                setActiveChatSession({})
                setShowFullInput(true)
                setStatsVersion(v => v + 1)
                return true
            }
            return false
        } catch (e) {
            console.error("Failed to clear data", e)
            return false
        }
    }

    const clearActiveChat = (repoUrl) => {
        setActiveChatSession(prev => {
            const updated = { ...prev }
            delete updated[repoUrl]
            return updated
        })
    }

    const clearArchivedChat = (repoUrl) => {
        setChatArchive(prev => {
            const updated = { ...prev }
            delete updated[repoUrl]
            return updated
        })
        setActiveChatSession(prev => {
            const updated = { ...prev }
            delete updated[repoUrl]
            return updated
        })
    }

    const restoreArchivedChat = (repoUrl) => {
        setActiveChatSession(prev => ({
            ...prev,
            [repoUrl]: chatArchive[repoUrl] || []
        }))
    }

    return (
        <AppContext.Provider value={{
            repos,
            setRepos,
            statsVersion,
            activeRepo,
            setActiveRepo,
            chatHistories: chatArchive,
            chatArchive,
            activeChatSession,
            isIngesting,
            ingestStatus,
            error,
            showFullInput,
            setShowFullInput,
            handleIngest,
            handleSelectRepo,
            handleAddRepoClick,
            handleSendMessage,
            deleteRepo,
            clearAllData,
            clearActiveChat,
            clearArchivedChat,
            restoreArchivedChat,
            progress,
            alreadyIndexed,
            setAlreadyIndexed,
            pendingRepoUrl,
            setPendingRepoUrl,
            proceedIngestion
        }}>
            {children}
        </AppContext.Provider>
    )
}

export const useApp = () => useContext(AppContext)
export default AppContext