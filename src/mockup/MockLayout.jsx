import React from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { ArrowLeft, GraduationCap, BookOpen } from 'lucide-react'
import { motion } from 'framer-motion'
import KnowledgeGraph from '../components/KnowledgeGraph'
import Logo from '../components/Logo'

const MockLayout = ({ children, role, breadcrumbs = [] }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const canGoBack = location.pathname !== '/mockup' &&
    location.pathname !== '/mockup/teacher' &&
    location.pathname !== '/mockup/student'

  const roleConfig = {
    teacher: { label: 'Teacher', icon: GraduationCap, color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/30' },
    student: { label: 'Student', icon: BookOpen, color: 'text-forest-emerald', bg: 'bg-forest-emerald/10 border-forest-emerald/30' },
  }

  const config = roleConfig[role]

  return (
    <div className="min-h-screen relative overflow-hidden">
      <KnowledgeGraph opacity={0.2} />

      <header className="relative z-10 border-b border-forest-border/30 bg-forest-darker/20 backdrop-blur-md">
        <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto px-6 xl:px-8 2xl:px-12 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {canGoBack && (
                <button
                  onClick={() => navigate(-1)}
                  className="p-2 text-forest-light-gray hover:text-white hover:bg-forest-card/50 rounded-lg transition-colors"
                >
                  <ArrowLeft size={20} />
                </button>
              )}
              <Logo size="md" clickable={false} />
              {config && (
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${config.bg} ${config.color}`}>
                  {config.label}
                </span>
              )}
            </div>

            <div className="flex items-center gap-4">
              {breadcrumbs.length > 0 && (
                <nav className="hidden md:flex items-center gap-2 text-sm">
                  {breadcrumbs.map((crumb, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && <span className="text-forest-gray">/</span>}
                      {crumb.to ? (
                        <Link to={crumb.to} className="text-forest-light-gray hover:text-forest-emerald transition-colors">
                          {crumb.label}
                        </Link>
                      ) : (
                        <span className="text-white font-medium">{crumb.label}</span>
                      )}
                    </React.Fragment>
                  ))}
                </nav>
              )}
              <Link
                to="/mockup"
                className="text-sm text-forest-gray hover:text-forest-emerald transition-colors"
              >
                Switch Role
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {children}
        </motion.div>
      </main>
    </div>
  )
}

export default MockLayout
