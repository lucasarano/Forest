import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LogOut,
  Brain,
  BookOpen,
  Target,
  TrendingUp,
  Sparkles,
  Network
} from 'lucide-react'
import KnowledgeGraph from '../components/KnowledgeGraph'
import Logo from '../components/Logo'
import Button from '../components/Button'
import { useAuth } from '../context/AuthContext'

const Dashboard = () => {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const userName = user?.user_metadata?.full_name || user?.email || 'User'

  const handleLogout = async () => {
    await signOut()
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
            Your Learning Dashboard
          </h1>
          <p className="text-base xl:text-lg 2xl:text-xl text-forest-light-gray">
            Continue your journey to mastery
          </p>
        </motion.div>

        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 xl:gap-8 mb-8"
        >
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + index * 0.05 }}
              className="bg-forest-card/70 backdrop-blur-sm border border-forest-border rounded-xl p-6 xl:p-8"
            >
              <div className="flex items-center justify-between mb-4">
                <stat.icon className={`${stat.color} xl:w-7 xl:h-7 2xl:w-8 2xl:h-8`} size={24} />
                <span className="text-2xl xl:text-3xl 2xl:text-4xl font-bold text-white">{stat.value}</span>
              </div>
              <p className="text-forest-light-gray text-sm xl:text-base">{stat.label}</p>
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
            <h2 className="text-2xl xl:text-3xl 2xl:text-4xl font-bold text-white">Continue Learning</h2>
            <Button variant="ghost">View All</Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-6 xl:gap-8">
            {recentCourses.map((course, index) => (
              <motion.div
                key={course.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + index * 0.1 }}
                className="bg-forest-card/70 backdrop-blur-sm border border-forest-border rounded-xl p-6 xl:p-8"
              >
                <div className="mb-4">
                  <span className="text-xs xl:text-sm text-forest-emerald font-medium">
                    {course.category}
                  </span>
                  <h3 className="text-lg xl:text-xl 2xl:text-2xl font-semibold text-white mt-2">
                    {course.title}
                  </h3>
                  <p className="text-sm xl:text-base text-forest-gray mt-1">
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
          className="grid grid-cols-1 md:grid-cols-2 gap-6 xl:gap-8"
        >
          <motion.div
            className="bg-gradient-to-br from-forest-emerald/10 to-forest-teal/10 border border-forest-emerald/30 rounded-xl p-6 backdrop-blur-sm"
          >
            <div className="flex items-start gap-4 xl:gap-6">
              <div className="p-3 xl:p-4 bg-forest-emerald/20 rounded-lg">
                <Sparkles className="text-forest-emerald xl:w-7 xl:h-7 2xl:w-8 2xl:h-8" size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-xl xl:text-2xl 2xl:text-3xl font-semibold text-white mb-2">
                  AI-Powered Recommendations
                </h3>
                <p className="text-forest-light-gray xl:text-lg mb-4">
                  Get personalized course suggestions based on your learning patterns
                </p>
                <Button variant="secondary">Discover Courses</Button>
              </div>
            </div>
          </motion.div>

          <motion.div
            className="bg-gradient-to-br from-forest-teal/10 to-forest-green/10 border border-forest-teal/30 rounded-xl p-6 backdrop-blur-sm"
          >
            <div className="flex items-start gap-4 xl:gap-6">
              <div className="p-3 xl:p-4 bg-forest-teal/20 rounded-lg">
                <Network className="text-forest-teal xl:w-7 xl:h-7 2xl:w-8 2xl:h-8" size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-xl xl:text-2xl 2xl:text-3xl font-semibold text-white mb-2">
                  Knowledge Graph
                </h3>
                <p className="text-forest-light-gray xl:text-lg mb-4">
                  Visualize connections between concepts you've learned
                </p>
                <Link to="/tree">
                  <Button variant="secondary">Explore Graph</Button>
                </Link>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </main>
    </div>
  )
}

export default Dashboard
