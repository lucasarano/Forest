import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { User, Mail, Lock, ArrowRight, CheckCircle, AlertCircle } from 'lucide-react'
import KnowledgeGraph from '../components/KnowledgeGraph'
import Logo from '../components/Logo'
import Button from '../components/Button'
import Input from '../components/Input'
import { useAuth } from '../context/AuthContext'

const Signup = () => {
  const navigate = useNavigate()
  const { signUp, user } = useAuth()
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  })
  const [errors, setErrors] = useState({})
  const [passwordStrength, setPasswordStrength] = useState(0)
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')

  // Redirect if already logged in
  React.useEffect(() => {
    if (user) {
      navigate('/dashboard')
    }
  }, [user, navigate])

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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setServerError('')
    const newErrors = validateForm()

    if (Object.keys(newErrors).length === 0) {
      setLoading(true)
      const { data, error } = await signUp(formData.email, formData.password, formData.name)

      if (error) {
        setServerError(error.message)
        setLoading(false)
      } else if (data.user) {
        // Check if email confirmation is required
        if (data.user.identities?.length === 0) {
          setServerError('Please check your email to confirm your account')
          setLoading(false)
        } else {
          navigate('/dashboard')
        }
      }
    } else {
      setErrors(newErrors)
    }
  }

  const strengthColors = ['#ef4444', '#f59e0b', '#eab308', '#10b981']
  const strengthLabels = ['Weak', 'Fair', 'Good', 'Strong']

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden py-12">
      <KnowledgeGraph opacity={0.5} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md xl:max-w-lg 2xl:max-w-xl mx-4"
      >
        <div className="bg-forest-darker/50 backdrop-blur-md border border-forest-border/50 rounded-2xl p-8 xl:p-10 2xl:p-12 shadow-2xl">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <Logo size="lg" clickable />
          </div>

          {/* Header */}
          <motion.div
            className="text-center mb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <h1 className="text-3xl font-bold text-white mb-2">
              Join Forest
            </h1>
            <p className="text-forest-light-gray">
              Start your AI-powered learning journey today
            </p>
          </motion.div>

          {/* Server Error */}
          {serverError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 mb-6"
            >
              <div className="flex items-center gap-2 text-red-400">
                <AlertCircle size={20} />
                <p className="text-sm">{serverError}</p>
              </div>
            </motion.div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
            <Input
              label="Full Name"
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder=""
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
              placeholder=""
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
                placeholder=""
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
                        className="h-1 flex-1 rounded-full transition-all duration-100"
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
              placeholder=""
              icon={CheckCircle}
              error={errors.confirmPassword}
              required
            />

            {/* TO-DO: populate terms and conditions pages
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
            </div> */}

            <Button type="submit" variant="primary" fullWidth disabled={loading}>
              <span className="flex items-center justify-center gap-2">
                {loading ? 'Creating Account...' : 'Create Account'}
                {!loading && <ArrowRight size={18} />}
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
                className="text-forest-emerald hover:text-forest-teal font-medium transition-colors duration-100"
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
