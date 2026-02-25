import React from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { GraduationCap, BookOpen } from 'lucide-react'
import KnowledgeGraph from '../components/KnowledgeGraph'
import Logo from '../components/Logo'

const RolePicker = () => {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <KnowledgeGraph opacity={0.4} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-2xl mx-4"
      >
        <div className="text-center mb-10">
          <div className="flex justify-center mb-6">
            <Logo size="lg" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Mockup Preview</h1>
          <p className="text-forest-light-gray">Choose a role to explore the app experience</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/mockup/teacher')}
            className="bg-forest-card/70 backdrop-blur-sm border border-forest-border hover:border-amber-400/50 rounded-xl p-8 text-center transition-colors group"
          >
            <div className="w-16 h-16 bg-amber-400/10 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-amber-400/20 transition-colors">
              <GraduationCap size={32} className="text-amber-400" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Teacher</h2>
            <p className="text-sm text-forest-light-gray">
              View courses, analytics, concept graphs, and student performance
            </p>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/mockup/student')}
            className="bg-forest-card/70 backdrop-blur-sm border border-forest-border hover:border-forest-emerald/50 rounded-xl p-8 text-center transition-colors group"
          >
            <div className="w-16 h-16 bg-forest-emerald/10 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-forest-emerald/20 transition-colors">
              <BookOpen size={32} className="text-forest-emerald" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Student</h2>
            <p className="text-sm text-forest-light-gray">
              Browse courses, study concept graphs, chat with AI, and take tests
            </p>
          </motion.button>
        </div>
      </motion.div>
    </div>
  )
}

export default RolePicker
