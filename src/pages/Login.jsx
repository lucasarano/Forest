import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Lock, ArrowRight } from 'lucide-react'
import KnowledgeGraph from '../components/KnowledgeGraph'
import Logo from '../components/Logo'
import Button from '../components/Button'
import Input from '../components/Input'

const Login = () => {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  })
  const [errors, setErrors] = useState({})

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const validateForm = () => {
    const newErrors = {}

    if (!formData.email) {
      newErrors.email = 'Email is required'
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters'
    }

    return newErrors
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const newErrors = validateForm()

    if (Object.keys(newErrors).length === 0) {
      // Here you would normally call your authentication API
      console.log('Login attempt:', formData)
      navigate('/dashboard')
    } else {
      setErrors(newErrors)
    }
  }

  return (
    <div className="min-h-screen bg-forest-dark flex items-center justify-center relative overflow-hidden">
      <KnowledgeGraph opacity={0.25} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        <div className="bg-forest-darker/80 backdrop-blur-xl border border-forest-border rounded-2xl p-8 shadow-2xl">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <Logo size="lg" />
          </div>

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">
              Welcome Back
            </h1>
            <p className="text-forest-light-gray">
              Sign in to continue your learning journey
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <Input
              label="Email"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="you@example.com"
              icon={Mail}
              error={errors.email}
              required
            />

            <Input
              label="Password"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="••••••••"
              icon={Lock}
              error={errors.password}
              required
            />

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-forest-light-gray cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-forest-border bg-forest-card text-forest-emerald focus:ring-forest-emerald focus:ring-offset-0"
                />
                Remember me
              </label>
              <Link
                to="/forgot-password"
                className="text-forest-emerald hover:text-forest-teal transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            <Button type="submit" variant="primary" fullWidth>
              <span className="flex items-center justify-center gap-2">
                Sign In
                <ArrowRight size={18} />
              </span>
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-forest-border"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-forest-darker text-forest-gray">
                or
              </span>
            </div>
          </div>

          {/* Sign up link */}
          <div className="text-center">
            <p className="text-forest-light-gray">
              Don't have an account?{' '}
              <Link
                to="/signup"
                className="text-forest-emerald hover:text-forest-teal font-medium transition-colors"
              >
                Sign up for free
              </Link>
            </p>
          </div>
        </div>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center mt-8 text-forest-gray text-sm"
        >
          By signing in, you agree to our Terms of Service and Privacy Policy
        </motion.p>
      </motion.div>
    </div>
  )
}

export default Login
