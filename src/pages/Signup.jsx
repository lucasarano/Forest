import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { User, Mail, Lock, ArrowRight, CheckCircle } from 'lucide-react'
import KnowledgeGraph from '../components/KnowledgeGraph'
import Logo from '../components/Logo'
import Button from '../components/Button'
import Input from '../components/Input'

const Signup = () => {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  })
  const [errors, setErrors] = useState({})
  const [passwordStrength, setPasswordStrength] = useState(0)

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))

    if (name === 'password') {
      calculatePasswordStrength(value)
    }

    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const calculatePasswordStrength = (password) => {
    let strength = 0
    if (password.length >= 8) strength++
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++
    if (/\d/.test(password)) strength++
    if (/[^a-zA-Z\d]/.test(password)) strength++
    setPasswordStrength(strength)
  }

  const validateForm = () => {
    const newErrors = {}

    if (!formData.name) {
      newErrors.name = 'Name is required'
    } else if (formData.name.length < 2) {
      newErrors.name = 'Name must be at least 2 characters'
    }

    if (!formData.email) {
      newErrors.email = 'Email is required'
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters'
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password'
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    return newErrors
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const newErrors = validateForm()

    if (Object.keys(newErrors).length === 0) {
      // Here you would normally call your registration API
      console.log('Signup attempt:', formData)
      navigate('/dashboard')
    } else {
      setErrors(newErrors)
    }
  }

  const strengthColors = ['#ef4444', '#f59e0b', '#eab308', '#10b981']
  const strengthLabels = ['Weak', 'Fair', 'Good', 'Strong']

  return (
    <div className="min-h-screen bg-forest-dark flex items-center justify-center relative overflow-hidden py-12">
      <KnowledgeGraph opacity={0.25} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        <div className="bg-forest-darker/80 backdrop-blur-xl border border-forest-border rounded-2xl p-8 shadow-2xl">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <Logo size="lg" />
          </div>

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">
              Join Forest
            </h1>
            <p className="text-forest-light-gray">
              Start your AI-powered learning journey today
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Full Name"
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="John Doe"
              icon={User}
              error={errors.name}
              required
            />

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

            <div>
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

              {formData.password && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[...Array(4)].map((_, i) => (
                      <div
                        key={i}
                        className="h-1 flex-1 rounded-full transition-all"
                        style={{
                          backgroundColor: i < passwordStrength ? strengthColors[passwordStrength - 1] : '#1f2d27'
                        }}
                      />
                    ))}
                  </div>
                  {passwordStrength > 0 && (
                    <p className="text-xs" style={{ color: strengthColors[passwordStrength - 1] }}>
                      Password strength: {strengthLabels[passwordStrength - 1]}
                    </p>
                  )}
                </div>
              )}
            </div>

            <Input
              label="Confirm Password"
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="••••••••"
              icon={CheckCircle}
              error={errors.confirmPassword}
              required
            />

            <div className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                required
                className="w-4 h-4 mt-0.5 rounded border-forest-border bg-forest-card text-forest-emerald focus:ring-forest-emerald focus:ring-offset-0"
              />
              <label className="text-forest-light-gray">
                I agree to the{' '}
                <Link to="/terms" className="text-forest-emerald hover:text-forest-teal">
                  Terms of Service
                </Link>
                {' '}and{' '}
                <Link to="/privacy" className="text-forest-emerald hover:text-forest-teal">
                  Privacy Policy
                </Link>
              </label>
            </div>

            <Button type="submit" variant="primary" fullWidth>
              <span className="flex items-center justify-center gap-2">
                Create Account
                <ArrowRight size={18} />
              </span>
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-forest-border"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-forest-darker text-forest-gray">
                or
              </span>
            </div>
          </div>

          {/* Sign in link */}
          <div className="text-center">
            <p className="text-forest-light-gray">
              Already have an account?{' '}
              <Link
                to="/login"
                className="text-forest-emerald hover:text-forest-teal font-medium transition-colors"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default Signup
