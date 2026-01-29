import React from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Home } from 'lucide-react'
import TreeCanvas from '../components/LearningTree/TreeCanvas'

const LearningTree = () => {
  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* Top Navigation */}
      <div className="absolute top-4 left-4 right-4 z-50 flex items-center justify-between">
        <Link to="/dashboard">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-4 py-2 bg-forest-card/80 backdrop-blur-md border border-forest-border rounded-lg text-forest-emerald hover:border-forest-emerald transition-all duration-100 flex items-center gap-2"
          >
            <Home size={18} />
            <span>Back to Dashboard</span>
          </motion.button>
        </Link>

        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <h1 className="text-2xl font-bold text-white">Learning Tree</h1>
          <p className="text-sm text-forest-light-gray">Build your knowledge universe</p>
        </motion.div>

        <div className="w-32" /> {/* Spacer for centering */}
      </div>

      {/* Tree Canvas */}
      <TreeCanvas />
    </div>
  )
}

export default LearningTree
