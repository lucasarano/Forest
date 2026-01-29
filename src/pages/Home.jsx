import React from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Brain, BookOpen, Target, Sparkles, ArrowRight } from 'lucide-react'
import KnowledgeGraph from '../components/KnowledgeGraph'
import Logo from '../components/Logo'
import Button from '../components/Button'

const Home = () => {
  const features = [
    {
      icon: Brain,
      title: 'AI-Powered Learning',
      description: 'Personalized learning paths adapted to your pace and style'
    },
    {
      icon: BookOpen,
      title: 'Rich Content',
      description: 'Comprehensive courses across multiple subjects and skills'
    },
    {
      icon: Target,
      title: 'Goal Tracking',
      description: 'Set and achieve your learning goals with smart milestones'
    },
    {
      icon: Sparkles,
      title: 'Knowledge Mapping',
      description: 'Visualize connections between concepts you learn'
    }
  ]

  return (
    <div className="min-h-screen relative overflow-hidden">
      <KnowledgeGraph opacity={0.35} />

      {/* Header */}
      <header className="relative z-10 border-b border-forest-border/30 bg-forest-darker/20 backdrop-blur-md">
        <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto px-6 xl:px-8 2xl:px-12 py-4">
          <div className="flex items-center justify-between">
            <Logo size="md" clickable />
            <div className="flex items-center gap-4">
              <Link to="/login">
                <Button variant="ghost">Sign In</Button>
              </Link>
              <Link to="/signup">
                <Button variant="primary">Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 max-w-7xl 2xl:max-w-[1600px] mx-auto px-6 xl:px-8 2xl:px-12">
        <div className="min-h-[calc(100vh-80px)] flex flex-col items-center justify-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-4xl"
          >
            <h1 className="text-5xl md:text-6xl xl:text-7xl 2xl:text-8xl font-bold text-white mb-6">
              Master Any Subject with{' '}
              <span className="bg-gradient-to-r from-forest-emerald to-forest-teal bg-clip-text text-transparent">
                AI Guidance
              </span>
            </h1>
            <p className="text-lg xl:text-xl 2xl:text-2xl text-forest-light-gray mb-10 max-w-2xl xl:max-w-3xl mx-auto">
              Forest combines cutting-edge AI with visual knowledge mapping to create
              a personalized learning experience that adapts to you.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link to="/signup">
                <Button variant="primary" className="text-lg px-8 py-4">
                  <span className="flex items-center gap-2">
                    Start Learning Free
                    <ArrowRight size={20} />
                  </span>
                </Button>
              </Link>
              <Button variant="secondary" className="text-lg px-8 py-4">
                Watch Demo
              </Button>
            </div>
          </motion.div>

          {/* Features Grid */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 xl:gap-8 mt-24 w-full"
          >
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 + index * 0.1 }}
                className="bg-forest-card/50 backdrop-blur-sm border border-forest-border rounded-xl p-6 xl:p-8"
              >
                <div className="inline-flex p-3 xl:p-4 bg-forest-emerald/10 rounded-lg mb-4">
                  <feature.icon className="text-forest-emerald xl:w-7 xl:h-7 2xl:w-8 2xl:h-8" size={24} />
                </div>
                <h3 className="text-lg xl:text-xl 2xl:text-2xl font-semibold text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-forest-light-gray text-sm xl:text-base">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </main>
    </div>
  )
}

export default Home
