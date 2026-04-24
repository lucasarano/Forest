import React from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import KnowledgeGraph from '../components/KnowledgeGraph'
import Logo from '../components/Logo'
import Button from '../components/Button'

const Home = () => {
  return (
    <div className="min-h-screen relative overflow-hidden">
      <KnowledgeGraph opacity={0.35} />

      <header className="relative z-10 border-b border-forest-border/30 bg-forest-darker/20 backdrop-blur-md">
        <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto px-6 xl:px-8 2xl:px-12 py-4">
          <div className="flex items-center justify-between">
            <Logo size="md" clickable />
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-6 xl:px-8">
        <div className="min-h-[calc(100vh-80px)] flex flex-col items-center justify-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl"
          >
            <h1 className="text-5xl md:text-6xl xl:text-7xl font-bold text-white mb-6">
              Master Any Subject with{' '}
              <span className="bg-gradient-to-r from-forest-emerald to-forest-teal bg-clip-text text-transparent">
                AI Guidance
              </span>
            </h1>
            <p className="text-lg xl:text-xl text-forest-light-gray mb-12 max-w-2xl mx-auto">
              Forest maps what you know, identifies gaps, and guides you through them with an adaptive tutor.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl"
          >
            <Link to="/learn" className="block">
              <Button variant="primary" className="w-full text-lg px-6 py-5">
                <span className="flex items-center justify-center gap-2">
                  Student
                  <ArrowRight size={20} />
                </span>
              </Button>
            </Link>
            <Link to="/teacher" className="block">
              <Button variant="secondary" className="w-full text-lg px-6 py-5">
                <span className="flex items-center justify-center gap-2">
                  Teacher
                  <ArrowRight size={20} />
                </span>
              </Button>
            </Link>
            <Link to="/ops" className="block">
              <Button variant="secondary" className="w-full text-lg px-6 py-5">
                <span className="flex items-center justify-center gap-2">
                  Ops
                  <ArrowRight size={20} />
                </span>
              </Button>
            </Link>
          </motion.div>
        </div>
      </main>
    </div>
  )
}

export default Home
