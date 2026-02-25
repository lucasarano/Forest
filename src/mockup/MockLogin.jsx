import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Lock, ArrowRight, GraduationCap, BookOpen } from 'lucide-react'
import KnowledgeGraph from '../components/KnowledgeGraph'
import Logo from '../components/Logo'
import Button from '../components/Button'
import Input from '../components/Input'

const MockLogin = () => {
  const navigate = useNavigate()
  const [selectedRole, setSelectedRole] = useState(null)
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  })

  const roles = [
    {
      id: 'teacher',
      label: 'Teacher',
      icon: GraduationCap,
      color: 'amber',
      email: 'schen@gatech.edu',
      name: 'Dr. Sarah Chen',
      path: '/mockup/teacher'
    },
    {
      id: 'student',
      label: 'Student',
      icon: BookOpen,
      color: 'emerald',
      email: 'arivera@gatech.edu',
      name: 'Alex Rivera',
      path: '/mockup/student'
    }
  ]

  const handleRoleSelect = (role) => {
    setSelectedRole(role)
    setFormData({
      email: role.email,
      password: 'password123'
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (selectedRole) {
      navigate(selectedRole.path)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <KnowledgeGraph opacity={0.5} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md xl:max-w-lg 2xl:max-w-xl mx-4"
      >
        <div className="bg-forest-darker/50 backdrop-blur-md border border-forest-border/50 rounded-2xl p-8 xl:p-10 2xl:p-12 shadow-2xl">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <Logo size="lg" clickable={false} />
          </div>

          {/* Header */}
          <motion.div
            className="text-center mb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <h1 className="text-3xl font-bold text-white mb-2">
              Mockup Preview Login
            </h1>
            <p className="text-forest-light-gray">
              Select a role to explore the experience
            </p>
          </motion.div>

          {/* Role Selection */}
          {!selectedRole && (
            <div className="space-y-4 mb-6">
              {roles.map((role) => (
                <motion.button
                  key={role.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleRoleSelect(role)}
                  className={`w-full bg-forest-card/70 backdrop-blur-sm border border-forest-border hover:border-${role.color}-400/50 rounded-xl p-5 flex items-center gap-4 transition-colors group`}
                >
                  <div className={`w-12 h-12 bg-${role.color}-400/10 rounded-xl flex items-center justify-center group-hover:bg-${role.color}-400/20 transition-colors`}>
                    <role.icon size={24} className={`text-${role.color}-400`} />
                  </div>
                  <div className="flex-1 text-left">
                    <h3 className="text-lg font-semibold text-white mb-0.5">
                      Login as {role.label}
                    </h3>
                    <p className="text-sm text-forest-gray">{role.name}</p>
                  </div>
                  <ArrowRight size={20} className="text-forest-gray group-hover:text-white transition-colors" />
                </motion.button>
              ))}
            </div>
          )}

          {/* Login Form */}
          {selectedRole && (
            <motion.form
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={handleSubmit}
              className="space-y-6"
            >
              <div className={`bg-${selectedRole.color}-400/10 border border-${selectedRole.color}-400/30 rounded-lg p-4 flex items-center gap-3`}>
                <selectedRole.icon size={20} className={`text-${selectedRole.color}-400`} />
                <div>
                  <p className="text-sm text-forest-light-gray">Logging in as</p>
                  <p className="text-white font-medium">{selectedRole.name}</p>
                </div>
              </div>

              <Input
                label="Email"
                type="email"
                name="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                icon={Mail}
                disabled
              />

              <Input
                label="Password"
                type="password"
                name="password"
                value={formData.password}
                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                icon={Lock}
                disabled
              />

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setSelectedRole(null)}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button type="submit" variant="primary" className="flex-1">
                  <span className="flex items-center justify-center gap-2">
                    Continue
                    <ArrowRight size={18} />
                  </span>
                </Button>
              </div>
            </motion.form>
          )}

          {/* Skip to Role Picker */}
          <div className="mt-6 text-center">
            <button
              onClick={() => navigate('/mockup')}
              className="text-sm text-forest-gray hover:text-forest-emerald transition-colors"
            >
              Skip to role picker →
            </button>
          </div>
        </div>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center mt-8 text-forest-gray text-sm"
        >
          This is a mockup preview with pre-filled demo accounts
        </motion.p>
      </motion.div>
    </div>
  )
}

export default MockLogin
