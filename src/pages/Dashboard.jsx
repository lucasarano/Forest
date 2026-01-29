import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Trees,
  LogOut,
  Brain,
  BookOpen,
  Target,
  TrendingUp,
  Sparkles,
  Network
} from 'lucide-react'
import KnowledgeGraph from '../components/KnowledgeGraph'
import Button from '../components/Button'

const Dashboard = () => {
  const navigate = useNavigate()
  const [userName] = useState('John Doe')

  const handleLogout = () => {
    navigate('/login')
  }

  const stats = [
    { icon: BookOpen, label: 'Courses Active', value: '3', color: 'text-forest-emerald' },
    { icon: Target, label: 'Goals Completed', value: '12', color: 'text-forest-teal' },
    { icon: TrendingUp, label: 'Learning Streak', value: '7 days', color: 'text-forest-green' },
    { icon: Brain, label: 'Knowledge Points', value: '850', color: 'text-forest-emerald' }
  ]

  const recentCourses = [
    {
      title: 'Advanced React Patterns',
      progress: 65,
      lastAccessed: '2 hours ago',
      category: 'Web Development'
    },
    {
      title: 'Machine Learning Fundamentals',
      progress: 40,
      lastAccessed: '1 day ago',
      category: 'AI & ML'
    },
    {
      title: 'System Design Masterclass',
      progress: 85,
      lastAccessed: '3 days ago',
      category: 'Architecture'
    }
  ]

  return (
    <div className="min-h-screen bg-forest-dark relative overflow-hidden">
      <KnowledgeGraph opacity={0.15} />

      {/* Header */}
      <header className="relative z-10 border-b border-forest-border bg-forest-darker/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trees className="text-forest-emerald" size={28} />
              <span className="text-2xl font-bold bg-gradient-to-r from-forest-emerald to-forest-teal bg-clip-text text-transparent">
                Forest
              </span>
            </div>

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
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        {/* Welcome Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-bold text-white mb-2">
            Your Learning Dashboard
          </h1>
          <p className="text-forest-light-gray">
            Continue your journey to mastery
          </p>
        </motion.div>

        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
        >
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + index * 0.05 }}
              className="bg-forest-card border border-forest-border rounded-xl p-6 hover:border-forest-emerald transition-colors"
            >
              <div className="flex items-center justify-between mb-4">
                <stat.icon className={stat.color} size={24} />
                <span className="text-2xl font-bold text-white">{stat.value}</span>
              </div>
              <p className="text-forest-light-gray text-sm">{stat.label}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Recent Courses */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Continue Learning</h2>
            <Button variant="ghost">View All</Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recentCourses.map((course, index) => (
              <motion.div
                key={course.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + index * 0.1 }}
                className="bg-forest-card border border-forest-border rounded-xl p-6 hover:border-forest-emerald transition-all cursor-pointer group"
              >
                <div className="mb-4">
                  <span className="text-xs text-forest-emerald font-medium">
                    {course.category}
                  </span>
                  <h3 className="text-lg font-semibold text-white mt-2 group-hover:text-forest-emerald transition-colors">
                    {course.title}
                  </h3>
                  <p className="text-sm text-forest-gray mt-1">
                    Last accessed: {course.lastAccessed}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-forest-light-gray">Progress</span>
                    <span className="text-forest-emerald font-medium">{course.progress}%</span>
                  </div>
                  <div className="w-full bg-forest-darker rounded-full h-2">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${course.progress}%` }}
                      transition={{ delay: 0.5 + index * 0.1, duration: 0.8 }}
                      className="bg-gradient-to-r from-forest-emerald to-forest-teal h-2 rounded-full"
                    />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-6"
        >
          <div className="bg-gradient-to-br from-forest-emerald/10 to-forest-teal/10 border border-forest-emerald/30 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-forest-emerald/20 rounded-lg">
                <Sparkles className="text-forest-emerald" size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-white mb-2">
                  AI-Powered Recommendations
                </h3>
                <p className="text-forest-light-gray mb-4">
                  Get personalized course suggestions based on your learning patterns
                </p>
                <Button variant="secondary">Discover Courses</Button>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-forest-teal/10 to-forest-green/10 border border-forest-teal/30 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-forest-teal/20 rounded-lg">
                <Network className="text-forest-teal" size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-white mb-2">
                  Knowledge Graph
                </h3>
                <p className="text-forest-light-gray mb-4">
                  Visualize connections between concepts you've learned
                </p>
                <Button variant="secondary">Explore Graph</Button>
              </div>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  )
}

export default Dashboard
