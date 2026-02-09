import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LogOut,
  Plus,
  Trash2,
  TreePine,
  Loader,
  Clock,
  GitBranch,
} from 'lucide-react'
import KnowledgeGraph from '../components/KnowledgeGraph'
import Logo from '../components/Logo'
import Button from '../components/Button'
import { useAuth } from '../context/AuthContext'
import { listTrees, createTree, deleteTree } from '../lib/treeService'

const Dashboard = () => {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const userName = user?.user_metadata?.full_name || user?.email || 'User'

  const [trees, setTrees] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState(null)

  // Load the user's trees on mount
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      const { data, error } = await listTrees(user.id)
      if (cancelled) return
      if (error) {
        console.error('Failed to load trees:', error)
        const msg = error.message?.includes('relation') || error.code === '42P01'
          ? 'Database tables not found. Please run supabase_migration.sql in your Supabase SQL Editor first.'
          : `Could not load your trees: ${error.message || 'unknown error'}`
        setError(msg)
      } else {
        setTrees(data || [])
      }
      setIsLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [user?.id])

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  const handleCreateTree = async () => {
    if (!user?.id || isCreating) return
    setIsCreating(true)
    const { data, error } = await createTree(user.id, 'Untitled Tree')
    setIsCreating(false)
    if (error) {
      console.error('Failed to create tree:', error)
      const msg = error.message?.includes('relation') || error.code === '42P01'
        ? 'Database tables not found. Please run supabase_migration.sql in your Supabase SQL Editor first.'
        : `Could not create tree: ${error.message || 'unknown error'}`
      setError(msg)
      return
    }
    navigate(`/tree/${data.id}`)
  }

  const handleDeleteTree = async (treeId) => {
    if (deletingId) return
    setDeletingId(treeId)
    const { error } = await deleteTree(treeId)
    if (error) {
      console.error('Failed to delete tree:', error)
      setError('Could not delete tree.')
    } else {
      setTrees((prev) => prev.filter((t) => t.id !== treeId))
    }
    setDeletingId(null)
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now - d
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'Just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`
    const diffDay = Math.floor(diffHr / 24)
    if (diffDay < 7) return `${diffDay}d ago`
    return d.toLocaleDateString()
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <KnowledgeGraph opacity={0.3} />

      {/* Header */}
      <header className="relative z-10 border-b border-forest-border/30 bg-forest-darker/20 backdrop-blur-md">
        <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto px-6 xl:px-8 2xl:px-12 py-4">
          <div className="flex items-center justify-between">
            <Logo size="md" clickable />

            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-forest-light-gray">Welcome back,</p>
                <p className="font-medium text-white">{userName}</p>
              </div>
              <Button variant="ghost" onClick={handleLogout}>
                <LogOut size={20} />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-7xl 2xl:max-w-[1600px] mx-auto px-6 xl:px-8 2xl:px-12 py-8">
        {/* Welcome Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl xl:text-4xl 2xl:text-5xl font-bold text-white mb-2">
            Your Learning Trees
          </h1>
          <p className="text-base xl:text-lg 2xl:text-xl text-forest-light-gray">
            Pick up where you left off or start a new tree
          </p>
        </motion.div>

        {/* Error banner */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 bg-red-900/40 border border-red-700/60 text-red-200 px-4 py-3 rounded-xl text-sm flex items-center justify-between"
          >
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-300 hover:text-white ml-4">
              Dismiss
            </button>
          </motion.div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-24">
            <Loader size={28} className="animate-spin text-forest-emerald" />
          </div>
        )}

        {/* Tree grid */}
        {!isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-6 xl:gap-8"
          >
            {/* New tree card */}
            <motion.button
              type="button"
              onClick={handleCreateTree}
              disabled={isCreating}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="bg-forest-card/50 backdrop-blur-sm border-2 border-dashed border-forest-border hover:border-forest-emerald/60 rounded-xl p-8 flex flex-col items-center justify-center gap-3 transition-colors min-h-[180px] cursor-pointer disabled:opacity-50"
            >
              {isCreating ? (
                <Loader size={28} className="animate-spin text-forest-emerald" />
              ) : (
                <Plus size={28} className="text-forest-emerald" />
              )}
              <span className="text-forest-light-gray font-medium">
                {isCreating ? 'Creating...' : 'New Tree'}
              </span>
            </motion.button>

            {/* Existing trees */}
            <AnimatePresence>
              {trees.map((tree, index) => (
                <motion.div
                  key={tree.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: 0.05 * index }}
                  className="bg-forest-card/70 backdrop-blur-sm border border-forest-border rounded-xl p-6 xl:p-8 flex flex-col justify-between min-h-[180px] group"
                >
                  <div>
                    <Link to={`/tree/${tree.id}`} className="block">
                      <div className="flex items-start gap-3 mb-3">
                        <TreePine size={20} className="text-forest-emerald mt-0.5 flex-shrink-0" />
                        <h3 className="text-lg xl:text-xl font-semibold text-white group-hover:text-forest-emerald transition-colors line-clamp-2">
                          {tree.name}
                        </h3>
                      </div>
                    </Link>
                    <div className="flex items-center gap-4 text-sm text-forest-gray">
                      <span className="flex items-center gap-1.5">
                        <GitBranch size={14} />
                        {tree.nodeCount} {tree.nodeCount === 1 ? 'node' : 'nodes'}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock size={14} />
                        {formatDate(tree.updatedAt)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-forest-border/30">
                    <Link to={`/tree/${tree.id}`}>
                      <Button variant="secondary" className="text-sm">
                        Open
                      </Button>
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDeleteTree(tree.id)}
                      disabled={deletingId === tree.id}
                      className="p-2 text-forest-gray hover:text-red-400 rounded-lg hover:bg-red-900/20 transition-colors disabled:opacity-50"
                      title="Delete tree"
                    >
                      {deletingId === tree.id ? (
                        <Loader size={16} className="animate-spin" />
                      ) : (
                        <Trash2 size={16} />
                      )}
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Empty state */}
        {!isLoading && trees.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-center py-12"
          >
            <TreePine size={48} className="text-forest-emerald/30 mx-auto mb-4" />
            <p className="text-forest-light-gray text-lg mb-2">No trees yet</p>
            <p className="text-forest-gray text-sm mb-6">
              Create your first learning tree to get started
            </p>
          </motion.div>
        )}
      </main>
    </div>
  )
}

export default Dashboard
