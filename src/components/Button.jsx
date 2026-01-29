import React from 'react'
import { motion } from 'framer-motion'

const Button = ({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  className = '',
  disabled = false,
  fullWidth = false
}) => {
  const baseStyles = 'px-6 py-3 rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed'

  const variants = {
    primary: 'bg-gradient-to-r from-forest-emerald to-forest-teal text-forest-darker hover:shadow-lg hover:shadow-forest-emerald/20',
    secondary: 'bg-forest-card border border-forest-border text-forest-light-gray hover:border-forest-emerald hover:text-forest-emerald',
    ghost: 'text-forest-light-gray hover:text-forest-emerald hover:bg-forest-card'
  }

  const widthClass = fullWidth ? 'w-full' : ''

  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${variants[variant]} ${widthClass} ${className}`}
    >
      {children}
    </motion.button>
  )
}

export default Button
